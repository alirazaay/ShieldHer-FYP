import { useEffect, useRef, useState, useCallback } from 'react';
import { NativeModules, NativeEventEmitter, PermissionsAndroid, Platform } from 'react-native';

const { ScreamDetection } = NativeModules;
// Use the default emitter to avoid RN warning checks against module listener stubs.
const emitter = new NativeEventEmitter();

const THRESHOLD = 0.75;

export function useScreamDetection({
  onAutoDetect,
  onManualResult,
  onScreamDetected,
  enabled = false,
  continuous = false,
} = {}) {
  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const [isManualRecording, setIsManualRecording] = useState(false);
  const [lastProb, setLastProb] = useState(null);
  const [permissionGranted, setPermissionGranted] = useState(false);

  const subscriptionRef = useRef(null);
  const autoRunningRef = useRef(false);

  const requestPermission = useCallback(async () => {
    if (Platform.OS !== 'android') {
      setPermissionGranted(true);
      return true;
    }

    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
      title: 'Microphone Permission',
      message: 'ShieldHer needs microphone access for AI scream detection.',
      buttonPositive: 'Allow',
    });

    const ok = granted === PermissionsAndroid.RESULTS.GRANTED;
    setPermissionGranted(ok);
    return ok;
  }, []);

  const removeSubscription = useCallback(() => {
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
  }, []);

  const stopAutoDetection = useCallback(() => {
    if (!ScreamDetection?.stopAutoDetection) {
      return;
    }

    ScreamDetection.stopAutoDetection();
    removeSubscription();
    autoRunningRef.current = false;
    setIsAutoRunning(false);
  }, [removeSubscription]);

  const startAutoDetection = useCallback(async () => {
    if (!ScreamDetection?.startAutoDetection || !emitter) {
      console.error('[ShieldHer] ScreamDetection native module is unavailable.');
      return;
    }

    const ok = await requestPermission();
    if (!ok) {
      return;
    }

    ScreamDetection.startAutoDetection();
    autoRunningRef.current = true;
    setIsAutoRunning(true);

    removeSubscription();
    subscriptionRef.current = emitter.addListener('ScreamDetected', async (value) => {
      const prob = Number(value);
      const safeProb = Number.isFinite(prob) ? prob : 0;
      const payload = {
        prob: safeProb,
        confidence: safeProb,
        isScream: safeProb >= THRESHOLD,
        source: 'AUTO',
        timestamp: Date.now(),
      };

      setLastProb(safeProb);

      if (safeProb >= THRESHOLD && onAutoDetect) {
        await Promise.resolve(onAutoDetect({ prob: safeProb, timestamp: payload.timestamp }));
      }

      if (safeProb >= THRESHOLD && onScreamDetected) {
        await Promise.resolve(onScreamDetected(payload));
      }
    });
  }, [onAutoDetect, onScreamDetected, removeSubscription, requestPermission]);

  const onHoldStart = useCallback(async () => {
    if (!ScreamDetection?.startManualRecording) {
      console.error('[ShieldHer] startManualRecording is unavailable.');
      return;
    }

    const ok = await requestPermission();
    if (!ok) {
      return;
    }

    await ScreamDetection.startManualRecording();
    setIsManualRecording(true);
  }, [requestPermission]);

  const onHoldEnd = useCallback(async () => {
    if (!isManualRecording || !ScreamDetection?.stopManualRecording) {
      return null;
    }

    setIsManualRecording(false);
    try {
      const result = await ScreamDetection.stopManualRecording();

      if (onManualResult) {
        await Promise.resolve(onManualResult(result));
      }

      if (result?.triggered && onScreamDetected) {
        const prob = Number(result?.maxProb || 0);
        const payload = {
          prob,
          confidence: prob,
          isScream: prob >= THRESHOLD,
          source: 'MANUAL',
          timestamp: Date.now(),
        };
        await Promise.resolve(onScreamDetected(payload));
      }

      return result;
    } catch (e) {
      console.error('[ShieldHer] Manual recording error:', e);
      return null;
    }
  }, [isManualRecording, onManualResult, onScreamDetected]);

  useEffect(() => {
    if (!enabled || !continuous) {
      return undefined;
    }

    startAutoDetection();
    return () => {
      stopAutoDetection();
    };
  }, [enabled, continuous, startAutoDetection, stopAutoDetection]);

  useEffect(() => {
    return () => {
      if (autoRunningRef.current) {
        stopAutoDetection();
      }
      removeSubscription();
    };
  }, [removeSubscription, stopAutoDetection]);

  return {
    isAutoRunning,
    isManualRecording,
    lastProb,
    permissionGranted,
    startAutoDetection,
    stopAutoDetection,
    onHoldStart,
    onHoldEnd,
    requestPermission,
    // Compatibility exports for existing screens still using the older hook API.
    startDetection: startAutoDetection,
    stopDetection: stopAutoDetection,
    startListening: onHoldStart,
    stopListening: onHoldEnd,
    isListening: isManualRecording,
    isAnalyzing: false,
    result: lastProb == null ? null : { confidence: lastProb, isScream: lastProb >= THRESHOLD },
    error: null,
    detectionState: {
      isListening: isAutoRunning,
      lastConfidence: Number(lastProb || 0),
      trailingConsecutive: 0,
      lastEventAt: null,
      pendingConfirmation: false,
      detectionBuffer: [],
    },
    cooldownState: {
      isCoolingDown: false,
      lastTriggerTime: 0,
      remainingMs: 0,
    },
    detectionBuffer: [],
    pendingAlert: {
      visible: false,
      countdownSec: 0,
      acknowledged: false,
      confidence: Number(lastProb || 0),
      startedAt: 0,
      source: 'unknown',
    },
    cancelPendingAlert: () => {},
    allowPendingCountdown: () => {},
  };
}
