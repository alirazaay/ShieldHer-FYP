import { useEffect, useRef, useState, useCallback } from 'react';
import { DeviceEventEmitter, NativeModules, PermissionsAndroid, Platform } from 'react-native';

const ScreamDetectionModule = NativeModules.ScreamDetectionModule || NativeModules.ScreamDetection;
const DEFAULT_THRESHOLD = 0.003;
let lastGlobalScreamEventKey = null;
let lastGlobalScreamEventAt = 0;

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
  config = {},
} = {}) {
  const configuredThreshold = Number(config?.confidenceThreshold);
  const threshold = Number.isFinite(configuredThreshold) ? configuredThreshold : DEFAULT_THRESHOLD;

  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const [isManualRecording, setIsManualRecording] = useState(false);
  const [lastProb, setLastProb] = useState(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const listenersShouldBeActive = (enabled && continuous) || isAutoRunning || isManualRecording;

  const screamSubscriptionRef = useRef(null);
  const errorSubscriptionRef = useRef(null);
  const telemetrySubscriptionRef = useRef(null);
  const modelInfoSubscriptionRef = useRef(null);
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
    modelInfoSubscriptionRef.current?.remove();
    screamSubscriptionRef.current = null;
    errorSubscriptionRef.current = null;
    telemetrySubscriptionRef.current = null;
    modelInfoSubscriptionRef.current = null;
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
        result = {
          maxProb: Number(lastProb || 0),
          avgProb: Number(lastProb || 0),
          windowCount: 1,
          triggered: Number(lastProb || 0) >= threshold,
        };
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
            isScream: prob >= threshold,
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
    if (!listenersShouldBeActive) {
      removeSubscriptions();
      return undefined;
    }

    console.log('useScreamDetection: setting up event listeners');
    console.log('useScreamDetection: native module available =', Boolean(ScreamDetectionModule));

    removeSubscriptions();

    screamSubscriptionRef.current = DeviceEventEmitter.addListener('ScreamDetected', async (event) => {
      console.log('useScreamDetection: SCREAM event received:', event);

      const prob = extractProbability(event);
      const eventTimestamp = Number(event?.timestamp || Date.now());

      const eventKey = `${eventTimestamp}-${prob.toFixed(6)}`;
      const now = Date.now();
      if (lastGlobalScreamEventKey === eventKey && now - lastGlobalScreamEventAt < 2000) {
        console.log('useScreamDetection: duplicate scream event suppressed:', eventKey);
        return;
      }
      lastGlobalScreamEventKey = eventKey;
      lastGlobalScreamEventAt = now;

      setLastProb(prob);

      const payload = {
        prob,
        confidence: prob,
        isScream: prob >= threshold,
        source: 'AUTO',
        timestamp: eventTimestamp,
      };

      if (prob >= threshold && onAutoDetect) {
        await Promise.resolve(onAutoDetect({ prob, timestamp: payload.timestamp }));
      }

      if (prob >= threshold && onScreamDetected) {
        await Promise.resolve(onScreamDetected(payload));
      }
    });

    errorSubscriptionRef.current = DeviceEventEmitter.addListener('DetectionError', (event) => {
      console.error('useScreamDetection: detection error event:', event);
    });

    telemetrySubscriptionRef.current = DeviceEventEmitter.addListener('DetectionTelemetry', (event) => {
      const rawProb = Number(event?.rawProb ?? event?.probability ?? 0);
      const decisionProb = Number(event?.decisionProb ?? event?.probability ?? 0);
      const mode = event?.inputMode || 'unknown';
      const preprocessMode = event?.preprocessMode || 'unknown';
      const nativeThreshold = Number(event?.nativeThreshold ?? event?.threshold ?? DEFAULT_THRESHOLD);
      const jsThreshold = Number(event?.jsThreshold ?? threshold);
      const rawMax = Number(event?.rawMax ?? 0);
      const rawMin = Number(event?.rawMin ?? 0);
      const normalized = Boolean(event?.normalized);
      const rms = Number(event?.rms ?? 0);
      const peak = Number(event?.peak ?? 0);
      const meanAbs = Number(event?.meanAbs ?? 0);
      const frameIndex = Number(event?.frameIndex ?? 0);
      const hitsInWindow = Number(event?.hitsInWindow ?? event?.aboveThresholdCount ?? 0);
      const decisionWindowSize = Number(event?.windowSize ?? event?.decisionWindowSize ?? 0);
      console.log(
        `useScreamDetection: telemetry frame=${frameIndex} mode=${mode} preprocess=${preprocessMode} rawProb=${rawProb.toFixed(8)} decisionProb=${decisionProb.toFixed(8)} rawMax=${rawMax.toFixed(8)} rawMin=${rawMin.toFixed(8)} hits=${hitsInWindow}/${decisionWindowSize} normalized=${normalized} rms=${rms.toFixed(6)} peak=${peak.toFixed(6)} meanAbs=${meanAbs.toFixed(6)} nativeThreshold=${nativeThreshold.toFixed(4)} jsThreshold=${jsThreshold.toFixed(4)}`
      );
    });

    modelInfoSubscriptionRef.current = DeviceEventEmitter.addListener('DetectionModelInfo', (event) => {
      console.log(
        `useScreamDetection: modelInfo inputShape=${event?.inputShape} outputShape=${event?.outputShape} inputType=${event?.inputType} outputType=${event?.outputType} inputScale=${event?.inputScale} inputZero=${event?.inputZeroPoint} outputScale=${event?.outputScale} outputZero=${event?.outputZeroPoint}`
      );
    });

    return () => {
      console.log('useScreamDetection: cleaning up event listeners');
      removeSubscriptions();
    };
  }, [listenersShouldBeActive, onAutoDetect, onScreamDetected, removeSubscriptions, threshold]);

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
      callNativeStop();
      autoRunningRef.current = false;
      setIsAutoRunning(false);
      removeSubscriptions();
    };
  }, [callNativeStop, removeSubscriptions]);

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
    result: lastProb == null ? null : { confidence: lastProb, isScream: lastProb >= threshold },
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
