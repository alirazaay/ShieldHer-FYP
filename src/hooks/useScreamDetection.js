import { useEffect, useRef, useState, useCallback } from 'react';
import { DeviceEventEmitter, NativeModules, PermissionsAndroid, Platform } from 'react-native';

const ScreamDetectionModule = NativeModules.ScreamDetectionModule || NativeModules.ScreamDetection;
const DEFAULT_THRESHOLD = 0.003;
const DEFAULT_COOLDOWN_MS = 30000;
const MAX_DETECTION_BUFFER_SIZE = 10;
const HIGH_VARIANCE_THRESHOLD = 0.3;
let lastGlobalScreamEventKey = null;
let lastGlobalScreamEventAt = 0;
let autoDebugWavRunStarted = false;

const AUTO_DEBUG_WAV_DIR = '/sdcard/Android/data/com.shieldher.app/files';
const AUTO_DEBUG_WAV_PATHS = [
  `${AUTO_DEBUG_WAV_DIR}/shieldher_test_scream.wav`,
  `${AUTO_DEBUG_WAV_DIR}/shieldher_test_speech.wav`,
  `${AUTO_DEBUG_WAV_DIR}/shieldher_test_silence.wav`,
];

export const WAVEFORM_INPUT_MODES = {
  NORMALIZED: 'normalized',
  PCM16_FLOAT: 'pcm16_float',
};

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

function ensureNativeDebugMethod(methodName) {
  if (!ScreamDetectionModule || typeof ScreamDetectionModule[methodName] !== 'function') {
    throw new Error(`useScreamDetection: native debug method '${methodName}' is unavailable`);
  }
}

export async function setNativeWaveformInputMode(mode) {
  ensureNativeDebugMethod('setWaveformInputMode');
  const result = await ScreamDetectionModule.setWaveformInputMode(mode);
  console.log('useScreamDetection: native waveform input mode updated:', result);
  return result;
}

export async function setNativeWaveformModeComparisonEnabled(enabled) {
  ensureNativeDebugMethod('setWaveformModeComparisonEnabled');
  const result = await ScreamDetectionModule.setWaveformModeComparisonEnabled(Boolean(enabled));
  console.log('useScreamDetection: alternate waveform comparison updated:', result);
  return result;
}

export async function getNativeWaveformDebugConfig() {
  ensureNativeDebugMethod('getWaveformDebugConfig');
  return ScreamDetectionModule.getWaveformDebugConfig();
}

export async function runNativeDebugWavInference(filePath) {
  ensureNativeDebugMethod('runDebugWavInference');
  const result = await ScreamDetectionModule.runDebugWavInference(filePath);
  console.log('useScreamDetection: native debug WAV inference:', result);
  return result;
}

if (__DEV__ && typeof globalThis !== 'undefined') {
  globalThis.ShieldHerScreamDebug = {
    getWaveformDebugConfig: getNativeWaveformDebugConfig,
    runDebugWavInference: runNativeDebugWavInference,
    setWaveformInputMode: setNativeWaveformInputMode,
    setWaveformModeComparisonEnabled: setNativeWaveformModeComparisonEnabled,
  };
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
  const cooldownMs = Number.isFinite(Number(config?.cooldownMs))
    ? Number(config.cooldownMs)
    : DEFAULT_COOLDOWN_MS;

  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const [isManualRecording, setIsManualRecording] = useState(false);
  const [lastProb, setLastProb] = useState(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [cooldownState, setCooldownState] = useState({
    isCoolingDown: false,
    lastTriggerTime: 0,
    remainingMs: 0,
  });
  const [detectionBuffer, setDetectionBuffer] = useState([]);
  const listenersShouldBeActive = (enabled && continuous) || isAutoRunning || isManualRecording;

  const screamSubscriptionRef = useRef(null);
  const errorSubscriptionRef = useRef(null);
  const telemetrySubscriptionRef = useRef(null);
  const modelInfoSubscriptionRef = useRef(null);
  const cooldownTimerRef = useRef(null);
  const lastTriggerTimeRef = useRef(0);
  const autoRunningRef = useRef(false);
  const manualRunningRef = useRef(false);
  const detectionBufferRef = useRef([]);

  const requestPermission = useCallback(async () => {
    if (Platform.OS !== 'android') {
      setPermissionGranted(true);
      return true;
    }

    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Microphone Permission Required',
          message: 'ShieldHer needs microphone access to detect distress sounds and protect you.',
          buttonPositive: 'Grant Permission',
          buttonNegative: 'Cancel',
        }
      );

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

  const startCooldown = useCallback(() => {
    const now = Date.now();
    lastTriggerTimeRef.current = now;
    setCooldownState({ isCoolingDown: true, lastTriggerTime: now, remainingMs: cooldownMs });

    if (cooldownTimerRef.current) {
      clearInterval(cooldownTimerRef.current);
    }

    cooldownTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - lastTriggerTimeRef.current;
      const remaining = Math.max(0, cooldownMs - elapsed);
      if (remaining <= 0) {
        clearInterval(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
        setCooldownState({ isCoolingDown: false, lastTriggerTime: lastTriggerTimeRef.current, remainingMs: 0 });
      } else {
        setCooldownState({ isCoolingDown: true, lastTriggerTime: lastTriggerTimeRef.current, remainingMs: remaining });
      }
    }, 1000);
  }, [cooldownMs]);

  const isInCooldown = useCallback(() => {
    return (Date.now() - lastTriggerTimeRef.current) < cooldownMs;
  }, [cooldownMs]);

  const addToDetectionBuffer = useCallback((entry) => {
    detectionBufferRef.current = [
      ...detectionBufferRef.current.slice(-(MAX_DETECTION_BUFFER_SIZE - 1)),
      entry,
    ];
    setDetectionBuffer([...detectionBufferRef.current]);
  }, []);

  const isHighVariance = useCallback(() => {
    const buf = detectionBufferRef.current;
    if (buf.length < 3) return false;
    const recentProbs = buf.slice(-5).map((e) => e.rawProb || 0);
    const mean = recentProbs.reduce((a, b) => a + b, 0) / recentProbs.length;
    const variance = recentProbs.reduce((a, b) => a + (b - mean) ** 2, 0) / recentProbs.length;
    return Math.sqrt(variance) > HIGH_VARIANCE_THRESHOLD;
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
    if (cooldownTimerRef.current) {
      clearInterval(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
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
      return false;
    }

    if (autoRunningRef.current) {
      console.log('useScreamDetection: auto detection already running, ignoring duplicate start');
      return false;
    }

    if (manualRunningRef.current) {
      console.warn('useScreamDetection: auto detection blocked while manual recording is active');
      return false;
    }

    const ok = await requestPermission();
    if (!ok) {
      return false;
    }

    console.log('useScreamDetection: calling native start detection');
    const started = callNativeStart();
    if (!started) {
      console.error('useScreamDetection: no native start method found');
      return false;
    }

    autoRunningRef.current = true;
    setIsAutoRunning(true);
    return true;
  }, [callNativeStart, requestPermission]);

  const onHoldStart = useCallback(async () => {
    if (!ScreamDetectionModule) {
      console.error('useScreamDetection: native module unavailable for manual recording');
      return false;
    }

    if (autoRunningRef.current) {
      console.warn('useScreamDetection: manual recording blocked while auto detection is active');
      return false;
    }

    if (manualRunningRef.current) {
      console.log('useScreamDetection: manual recording already running, ignoring duplicate start');
      return false;
    }

    const ok = await requestPermission();
    if (!ok) {
      return false;
    }

    try {
      if (typeof ScreamDetectionModule.startManualRecording === 'function') {
        await ScreamDetectionModule.startManualRecording();
      } else {
        const started = callNativeStart();
        if (!started) {
          console.error('useScreamDetection: no manual/start method found');
          return false;
        }
      }

      console.log('useScreamDetection: manual recording started');
      manualRunningRef.current = true;
      setIsManualRecording(true);
      return true;
    } catch (error) {
      console.error('useScreamDetection: start manual recording failed:', error);
      manualRunningRef.current = false;
      return false;
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
    } finally {
      manualRunningRef.current = false;
    }
  }, [callNativeStop, isManualRecording, lastProb, onManualResult, onScreamDetected, threshold]);

  useEffect(() => {
    if (!listenersShouldBeActive) {
      removeSubscriptions();
      return undefined;
    }

    console.log('useScreamDetection: setting up event listeners');
    console.log('useScreamDetection: native module available =', Boolean(ScreamDetectionModule));

    removeSubscriptions();

    screamSubscriptionRef.current = DeviceEventEmitter.addListener(
      'ScreamDetected',
      async (event) => {
        console.log('useScreamDetection: SCREAM event received:', event);

        const prob = extractProbability(event);
        const eventTimestamp = Number(event?.timestamp || Date.now());

        // Duplicate suppression
        const eventKey = `${eventTimestamp}-${prob.toFixed(6)}`;
        const now = Date.now();
        if (lastGlobalScreamEventKey === eventKey && now - lastGlobalScreamEventAt < 2000) {
          console.log('useScreamDetection: duplicate scream event suppressed:', eventKey);
          return;
        }
        lastGlobalScreamEventKey = eventKey;
        lastGlobalScreamEventAt = now;

        // Cooldown enforcement
        if (isInCooldown()) {
          console.log('useScreamDetection: scream event suppressed (cooldown active)');
          return;
        }

        // High-variance guard — suppress if model output is oscillating wildly
        if (isHighVariance()) {
          console.warn('useScreamDetection: scream event suppressed (high output variance)');
          return;
        }

        setLastProb(prob);

        const payload = {
          prob,
          confidence: prob,
          isScream: prob >= threshold,
          source: 'AUTO',
          triggerType: 'AI',
          timestamp: eventTimestamp,
          hitsInWindow: Number(event?.hitsInWindow || 0),
          rms: Number(event?.rms || 0),
          peak: Number(event?.peak || 0),
        };

        if (prob >= threshold && onAutoDetect) {
          // Start cooldown before dispatching to prevent re-entry
          startCooldown();
          await Promise.resolve(onAutoDetect({ prob, timestamp: payload.timestamp, triggerType: 'AI' }));
        }

        if (prob >= threshold && onScreamDetected) {
          await Promise.resolve(onScreamDetected(payload));
        }
      }
    );

    errorSubscriptionRef.current = DeviceEventEmitter.addListener('DetectionError', (event) => {
      console.error('useScreamDetection: detection error event:', event);
    });

    telemetrySubscriptionRef.current = DeviceEventEmitter.addListener(
      'DetectionTelemetry',
      (event) => {
        const rawProb = Number(event?.rawProb ?? event?.probability ?? 0);
        const decisionProb = Number(event?.decisionProb ?? event?.probability ?? 0);
        const mode = event?.inputMode || 'unknown';
        const preprocessMode = event?.preprocessMode || 'unknown';
        const nativeThreshold = Number(
          event?.nativeThreshold ?? event?.threshold ?? DEFAULT_THRESHOLD
        );
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
        const waveformInputMode = String(event?.waveformInputMode || 'unknown');
        const compareAlternateWaveformMode = Boolean(event?.compareAlternateWaveformMode);
        const alternateWaveformInputMode =
          event?.alternateWaveformInputMode != null
            ? String(event.alternateWaveformInputMode)
            : null;
        const alternateRawProb =
          event?.alternateRawProb != null ? Number(event.alternateRawProb) : null;
        const alternateDecisionProb =
          event?.alternateDecisionProb != null ? Number(event.alternateDecisionProb) : null;
        const alternateSuffix =
          alternateWaveformInputMode && Number.isFinite(alternateRawProb)
            ? ` altMode=${alternateWaveformInputMode} altRawProb=${alternateRawProb.toFixed(8)} altDecisionProb=${Number(alternateDecisionProb || 0).toFixed(8)}`
            : '';

        // Track detection buffer for variance analysis
        addToDetectionBuffer({
          rawProb,
          decisionProb,
          rms,
          peak,
          hitsInWindow,
          frameIndex,
          timestamp: Date.now(),
        });

        console.log(
          `useScreamDetection: telemetry frame=${frameIndex} mode=${mode} waveformMode=${waveformInputMode} preprocess=${preprocessMode} rawProb=${rawProb.toFixed(8)} decisionProb=${decisionProb.toFixed(8)} rawMax=${rawMax.toFixed(8)} rawMin=${rawMin.toFixed(8)} hits=${hitsInWindow}/${decisionWindowSize} normalized=${normalized} rms=${rms.toFixed(6)} peak=${peak.toFixed(6)} meanAbs=${meanAbs.toFixed(6)} nativeThreshold=${nativeThreshold.toFixed(4)} jsThreshold=${jsThreshold.toFixed(4)} compareAlt=${compareAlternateWaveformMode}${alternateSuffix}`
        );
      }
    );

    modelInfoSubscriptionRef.current = DeviceEventEmitter.addListener(
      'DetectionModelInfo',
      (event) => {
        console.log(
          `useScreamDetection: modelInfo inputShape=${event?.inputShape} outputShape=${event?.outputShape} inputType=${event?.inputType} outputType=${event?.outputType} inputScale=${event?.inputScale} inputZero=${event?.inputZeroPoint} outputScale=${event?.outputScale} outputZero=${event?.outputZeroPoint}`
        );
      }
    );

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
    if (!__DEV__ || autoDebugWavRunStarted || !ScreamDetectionModule) {
      return undefined;
    }

    autoDebugWavRunStarted = true;
    let cancelled = false;

    const runOfflineDebugValidation = async () => {
      try {
        console.log('useScreamDetection: starting auto offline WAV validation');
        const configResult = await getNativeWaveformDebugConfig();
        if (!cancelled) {
          console.log('useScreamDetection: waveform debug config:', configResult);
        }

        for (const filePath of AUTO_DEBUG_WAV_PATHS) {
          try {
            const result = await runNativeDebugWavInference(filePath);
            if (!cancelled) {
              console.log(`useScreamDetection: offline WAV result ${filePath}`, result);
            }
          } catch (error) {
            if (!cancelled) {
              console.warn(`useScreamDetection: offline WAV skipped ${filePath}`, error);
            }
          }
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('useScreamDetection: auto offline WAV validation failed', error);
        }
      }
    };

    runOfflineDebugValidation();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      callNativeStop();
      autoRunningRef.current = false;
      manualRunningRef.current = false;
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
    getWaveformDebugConfig: getNativeWaveformDebugConfig,
    runDebugWavInference: runNativeDebugWavInference,
    setWaveformInputMode: setNativeWaveformInputMode,
    setWaveformModeComparisonEnabled: setNativeWaveformModeComparisonEnabled,
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
      trailingConsecutive: detectionBuffer.filter((e) => e.rawProb >= threshold).length,
      lastEventAt: detectionBuffer.length > 0 ? detectionBuffer[detectionBuffer.length - 1].timestamp : null,
      pendingConfirmation: false,
      detectionBuffer,
    },
    cooldownState,
    detectionBuffer,
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
