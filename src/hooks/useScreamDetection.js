import { useEffect, useRef, useState, useCallback } from 'react';
import { DeviceEventEmitter, NativeModules, PermissionsAndroid, Platform } from 'react-native';

const ScreamDetectionModule = NativeModules.ScreamDetectionModule || NativeModules.ScreamDetection;
const THRESHOLD = 0.65;

function extractProbability(event) {
  if (typeof event === 'number') {
    return Number.isFinite(event) ? event : 0;
  }

  if (event && typeof event === 'object') {
    const value =
      event.probability ?? event.confidence ?? event.prob ?? event.value ?? event.score ?? 0;
    return Number.isFinite(Number(value)) ? Number(value) : 0;
  }

  return 0;
}

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

  const screamSubscriptionRef = useRef(null);
  const errorSubscriptionRef = useRef(null);
  const telemetrySubscriptionRef = useRef(null);
  const autoRunningRef = useRef(false);

  const requestPermission = useCallback(async () => {
    if (Platform.OS !== 'android') {
      setPermissionGranted(true);
      return true;
    }

    try {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
        title: 'Microphone Permission Required',
        message: 'ShieldHer needs microphone access to detect distress sounds and protect you.',
        buttonPositive: 'Grant Permission',
        buttonNegative: 'Cancel',
      });

      const ok = granted === PermissionsAndroid.RESULTS.GRANTED;
      setPermissionGranted(ok);

      if (ok) {
        console.log('useScreamDetection: microphone permission granted');
      } else {
        console.log('useScreamDetection: microphone permission denied');
      }

      return ok;
    } catch (error) {
      console.error('useScreamDetection: permission request failed:', error);
      setPermissionGranted(false);
      return false;
    }
  }, []);

  const removeSubscriptions = useCallback(() => {
    screamSubscriptionRef.current?.remove();
    errorSubscriptionRef.current?.remove();
    telemetrySubscriptionRef.current?.remove();
    screamSubscriptionRef.current = null;
    errorSubscriptionRef.current = null;
    telemetrySubscriptionRef.current = null;
  }, []);

  const callNativeStart = useCallback(() => {
    if (typeof ScreamDetectionModule?.startDetection === 'function') {
      ScreamDetectionModule.startDetection();
      return true;
    }

    if (typeof ScreamDetectionModule?.startAutoDetection === 'function') {
      ScreamDetectionModule.startAutoDetection();
      return true;
    }

    return false;
  }, []);

  const callNativeStop = useCallback(() => {
    if (typeof ScreamDetectionModule?.stopDetection === 'function') {
      ScreamDetectionModule.stopDetection();
      return true;
    }

    if (typeof ScreamDetectionModule?.stopAutoDetection === 'function') {
      ScreamDetectionModule.stopAutoDetection();
      return true;
    }

    return false;
  }, []);

  const stopAutoDetection = useCallback(() => {
    const stopped = callNativeStop();
    if (!stopped) {
      console.warn('useScreamDetection: no native stop method found');
    }

    autoRunningRef.current = false;
    setIsAutoRunning(false);
  }, [callNativeStop]);

  const startAutoDetection = useCallback(async () => {
    if (!ScreamDetectionModule) {
      console.error('useScreamDetection: ScreamDetection native module is unavailable');
      return;
    }

    if (autoRunningRef.current) {
      console.log('useScreamDetection: auto detection already running, ignoring duplicate start');
      return;
    }

    const ok = await requestPermission();
    if (!ok) {
      return;
    }

    console.log('useScreamDetection: calling native start detection');
    const started = callNativeStart();
    if (!started) {
      console.error('useScreamDetection: no native start method found');
      return;
    }

    autoRunningRef.current = true;
    setIsAutoRunning(true);
  }, [callNativeStart, requestPermission]);

  const onHoldStart = useCallback(async () => {
    if (!ScreamDetectionModule) {
      console.error('useScreamDetection: native module unavailable for manual recording');
      return;
    }

    const ok = await requestPermission();
    if (!ok) {
      return;
    }

    try {
      if (typeof ScreamDetectionModule.startManualRecording === 'function') {
        await ScreamDetectionModule.startManualRecording();
      } else {
        const started = callNativeStart();
        if (!started) {
          console.error('useScreamDetection: no manual/start method found');
          return;
        }
      }

      console.log('useScreamDetection: manual recording started');
      setIsManualRecording(true);
    } catch (error) {
      console.error('useScreamDetection: start manual recording failed:', error);
    }
  }, [callNativeStart, requestPermission]);

  const onHoldEnd = useCallback(async () => {
    if (!isManualRecording) {
      return null;
    }

    setIsManualRecording(false);

    try {
      let result;
      if (typeof ScreamDetectionModule?.stopManualRecording === 'function') {
        result = await ScreamDetectionModule.stopManualRecording();
      } else {
        callNativeStop();
        result = { maxProb: Number(lastProb || 0), avgProb: Number(lastProb || 0), windowCount: 1, triggered: Number(lastProb || 0) >= THRESHOLD };
      }

      if (result?.maxProb != null) {
        setLastProb(Number(result.maxProb));
      }

      if (onManualResult) {
        await Promise.resolve(onManualResult(result));
      }

      if (result?.triggered && onScreamDetected) {
        const prob = Number(result?.maxProb || 0);
        await Promise.resolve(
          onScreamDetected({
            prob,
            confidence: prob,
            isScream: prob >= THRESHOLD,
            source: 'MANUAL',
            timestamp: Date.now(),
          })
        );
      }

      return result;
    } catch (error) {
      console.error('useScreamDetection: stop manual recording failed:', error);
      return null;
    }
  }, [callNativeStop, isManualRecording, lastProb, onManualResult, onScreamDetected]);

  useEffect(() => {
    console.log('useScreamDetection: setting up event listeners');
    console.log('useScreamDetection: native module available =', Boolean(ScreamDetectionModule));

    removeSubscriptions();

    screamSubscriptionRef.current = DeviceEventEmitter.addListener('ScreamDetected', async (event) => {
      console.log('useScreamDetection: SCREAM event received:', event);

      const prob = extractProbability(event);
      setLastProb(prob);

      const payload = {
        prob,
        confidence: prob,
        isScream: prob >= THRESHOLD,
        source: 'AUTO',
        timestamp: event?.timestamp || Date.now(),
      };

      if (prob >= THRESHOLD && onAutoDetect) {
        await Promise.resolve(onAutoDetect({ prob, timestamp: payload.timestamp }));
      }

      if (prob >= THRESHOLD && onScreamDetected) {
        await Promise.resolve(onScreamDetected(payload));
      }
    });

    errorSubscriptionRef.current = DeviceEventEmitter.addListener('DetectionError', (event) => {
      console.error('useScreamDetection: detection error event:', event);
    });

    telemetrySubscriptionRef.current = DeviceEventEmitter.addListener('DetectionTelemetry', (event) => {
      const prob = Number(event?.probability ?? 0);
      const mode = event?.inputMode || 'unknown';
      const threshold = Number(event?.threshold ?? THRESHOLD);
      console.log(
        `useScreamDetection: telemetry mode=${mode} prob=${prob.toFixed(4)} threshold=${threshold.toFixed(2)}`
      );
    });

    return () => {
      console.log('useScreamDetection: cleaning up event listeners');
      removeSubscriptions();
    };
  }, [onAutoDetect, onScreamDetected, removeSubscriptions]);

  useEffect(() => {
    if (!enabled || !continuous) {
      return undefined;
    }

    startAutoDetection();
    return () => {
      stopAutoDetection();
    };
  }, [continuous, enabled, startAutoDetection, stopAutoDetection]);

  useEffect(() => {
    return () => {
      if (autoRunningRef.current) {
        stopAutoDetection();
      }
      removeSubscriptions();
    };
  }, [removeSubscriptions, stopAutoDetection]);

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
