import { useEffect, useRef, useCallback, useState } from 'react';
import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import logger from '../utils/logger';

const TAG = '[AI_DETECTION]';

export const DEFAULT_SCREAM_CONFIG = {
  confidenceThreshold: 0.8,
  requiredConsecutiveFrames: 3,
  validationWindowMs: 2000,
  cooldownMs: 60000,
  intervalMs: 2000,
  confirmationCountdownSec: 5,
  maxBufferSize: 20,
};

// Expected native event payload shape:
// {
//   label: 'scream',
//   confidence: number,
//   timestamp?: number
// }
export function normalizeScreamEvent(rawEvent = {}, source = 'unknown') {
  const label = String(rawEvent?.label || (rawEvent?.isScream ? 'scream' : '')).toLowerCase();
  const confidence = Number(rawEvent?.confidence);
  const timestamp = Number(rawEvent?.timestamp || Date.now());

  if (!Number.isFinite(confidence)) {
    return null;
  }

  return {
    label: label || 'scream',
    confidence,
    timestamp,
    source,
  };
}

export function evaluateConsecutiveFrames(buffer, threshold, requiredFrames, windowMs, nowTs) {
  const windowStart = nowTs - windowMs;
  const recent = buffer.filter((frame) => frame.timestamp >= windowStart);

  let trailingConsecutive = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    const frame = recent[i];
    const isHighConfidenceScream = frame.label === 'scream' && frame.confidence >= threshold;
    if (!isHighConfidenceScream) break;
    trailingConsecutive++;
  }

  return {
    recent,
    trailingConsecutive,
    shouldTrigger: trailingConsecutive >= requiredFrames,
  };
}

export function isInCooldown(lastTriggerTime, nowTs, cooldownMs) {
  return lastTriggerTime > 0 && nowTs - lastTriggerTime < cooldownMs;
}

export function buildDetectionTelemetry(payload) {
  return {
    eventType: 'AI_DETECTION_EVENT',
    confidence: payload.confidence,
    timestamp: payload.timestamp,
    triggeredSOS: payload.triggeredSOS || false,
    cancelledByUser: payload.cancelledByUser || false,
    trailingConsecutive: payload.trailingConsecutive || 0,
    detectionDurationMs: payload.detectionDurationMs || 0,
    source: payload.source || 'unknown',
  };
}

export const useScreamDetection = ({
  onScreamDetected,
  enabled = false,
  continuous = false,
  config = {},
}) => {
  const runtimeConfig = { ...DEFAULT_SCREAM_CONFIG, ...config };
  const nativeModule = NativeModules.ScreamDetectionModule || NativeModules.ScreamDetection;

  const mountedRef = useRef(true);
  const loopActiveRef = useRef(false);
  const loopTimeoutRef = useRef(null);
  const isListeningRef = useRef(false);
  const analyzeInFlightRef = useRef(false);
  const lastTriggerTimeRef = useRef(0);

  const [isListening, setIsListening] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const [cooldownState, setCooldownState] = useState({
    isCoolingDown: false,
    lastTriggerTime: 0,
    remainingMs: 0,
  });

  const requestMicPermission = useCallback(async () => {
    if (Platform.OS !== 'android') return true;

    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
      title: 'ShieldHer Microphone Permission',
      message: 'ShieldHer needs mic access to detect screams and trigger SOS.',
      buttonPositive: 'Allow',
    });

    return granted === PermissionsAndroid.RESULTS.GRANTED;
  }, []);

  const setListeningState = useCallback((next) => {
    isListeningRef.current = next;
    if (mountedRef.current) {
      setIsListening(next);
    }
  }, []);

  const clearLoopTimeout = useCallback(() => {
    if (loopTimeoutRef.current) {
      clearTimeout(loopTimeoutRef.current);
      loopTimeoutRef.current = null;
    }
  }, []);

  const normalizeAnalysisResult = useCallback(
    (raw) => {
      const confidence = Number(raw?.confidence);
      const safeConfidence = Number.isFinite(confidence) ? confidence : 0;
      const screamed =
        raw?.isScream === true || safeConfidence >= Number(runtimeConfig.confidenceThreshold || 0.8);

      return {
        isScream: screamed,
        confidence: safeConfidence,
        timestamp: Date.now(),
      };
    },
    [runtimeConfig.confidenceThreshold]
  );

  const updateCooldown = useCallback(() => {
    const nowTs = Date.now();
    const remaining = Math.max(
      Number(runtimeConfig.cooldownMs || 0) - (nowTs - lastTriggerTimeRef.current),
      0
    );

    if (!mountedRef.current) return;

    setCooldownState({
      isCoolingDown: remaining > 0,
      lastTriggerTime: lastTriggerTimeRef.current,
      remainingMs: remaining,
    });
  }, [runtimeConfig.cooldownMs]);

  const triggerDetectedScream = useCallback(
    async (analysis, source = 'manual') => {
      const nowTs = Date.now();
      if (isInCooldown(lastTriggerTimeRef.current, nowTs, runtimeConfig.cooldownMs)) {
        logger.info(TAG, 'Scream detection ignored due to cooldown', {
          confidence: analysis.confidence,
          source,
        });
        return;
      }

      lastTriggerTimeRef.current = nowTs;
      updateCooldown();

      logger.warn(
        TAG,
        'AI_DETECTION_EVENT',
        buildDetectionTelemetry({
          confidence: analysis.confidence,
          timestamp: nowTs,
          source,
          triggeredSOS: true,
        })
      );

      if (onScreamDetected) {
        await onScreamDetected({
          ...analysis,
          label: 'scream',
          source,
        });
      }
    },
    [onScreamDetected, runtimeConfig.cooldownMs, updateCooldown]
  );

  const startListening = useCallback(async () => {
    if (isListeningRef.current) {
      return true;
    }

    if (!nativeModule || typeof nativeModule.startRecording !== 'function') {
      const moduleError = new Error('ScreamDetectionModule is not available on this build');
      setError(moduleError);
      logger.warn(TAG, moduleError.message);
      return false;
    }

    const hasPermission = await requestMicPermission();
    if (!hasPermission) {
      const permissionError = new Error('Microphone permission denied');
      setError(permissionError);
      return false;
    }

    try {
      await nativeModule.startRecording();
      setError(null);
      setListeningState(true);
      logger.info(TAG, 'Audio recording started');
      return true;
    } catch (startError) {
      logger.error(TAG, 'startRecording failed', startError);
      setError(startError instanceof Error ? startError : new Error(String(startError)));
      setListeningState(false);
      return false;
    }
  }, [nativeModule, requestMicPermission, setListeningState]);

  const stopListening = useCallback(async () => {
    if (!nativeModule || typeof nativeModule.stopAndAnalyze !== 'function') {
      const moduleError = new Error('ScreamDetectionModule.stopAndAnalyze is unavailable');
      setError(moduleError);
      return null;
    }

    if (analyzeInFlightRef.current) {
      return result;
    }

    if (!isListeningRef.current) {
      return result;
    }

    analyzeInFlightRef.current = true;
    try {
      const raw = await nativeModule.stopAndAnalyze();
      const analysis = normalizeAnalysisResult(raw || {});

      setResult(analysis);
      setError(null);
      setListeningState(false);

      if (analysis.isScream || analysis.confidence > Number(runtimeConfig.confidenceThreshold || 0.8)) {
        await triggerDetectedScream(analysis, loopActiveRef.current ? 'continuous' : 'manual');
      }

      return analysis;
    } catch (stopError) {
      logger.error(TAG, 'stopAndAnalyze failed', stopError);
      const normalizedError = stopError instanceof Error ? stopError : new Error(String(stopError));
      setError(normalizedError);
      setListeningState(false);
      return null;
    } finally {
      analyzeInFlightRef.current = false;
    }
  }, [
    nativeModule,
    normalizeAnalysisResult,
    result,
    runtimeConfig.confidenceThreshold,
    setListeningState,
    triggerDetectedScream,
  ]);

  const stopDetection = useCallback(async () => {
    loopActiveRef.current = false;
    clearLoopTimeout();

    if (isListeningRef.current) {
      await stopListening();
    }
  }, [clearLoopTimeout, stopListening]);

  const startDetection = useCallback(async () => {
    return startListening();
  }, [startListening]);

  // Continuous sliding-window detection loop (every intervalMs)
  useEffect(() => {
    if (!(enabled && continuous)) {
      loopActiveRef.current = false;
      clearLoopTimeout();
      return undefined;
    }

    loopActiveRef.current = true;

    const runLoop = async () => {
      if (!loopActiveRef.current || !mountedRef.current) return;

      const started = await startListening();
      if (!started || !loopActiveRef.current || !mountedRef.current) {
        loopTimeoutRef.current = setTimeout(runLoop, Number(runtimeConfig.intervalMs || 2000));
        return;
      }

      loopTimeoutRef.current = setTimeout(async () => {
        if (!loopActiveRef.current || !mountedRef.current) return;
        await stopListening();
        runLoop();
      }, Number(runtimeConfig.intervalMs || 2000));
    };

    runLoop();

    return () => {
      loopActiveRef.current = false;
      clearLoopTimeout();
    };
  }, [
    clearLoopTimeout,
    continuous,
    enabled,
    runtimeConfig.intervalMs,
    startListening,
    stopListening,
  ]);

  // Cooldown ticker
  useEffect(() => {
    const timer = setInterval(updateCooldown, 1000);
    return () => clearInterval(timer);
  }, [updateCooldown]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loopActiveRef.current = false;
      clearLoopTimeout();
      stopDetection();
    };
  }, [clearLoopTimeout, stopDetection]);

  const detectionState = {
    isListening,
    lastConfidence: Number(result?.confidence || 0),
    trailingConsecutive: Number(result?.isScream ? 1 : 0),
    lastEventAt: result?.timestamp || null,
    pendingConfirmation: false,
    detectionBuffer: result ? [result] : [],
  };

  const pendingAlert = {
    visible: false,
    countdownSec: 0,
    acknowledged: false,
    confidence: Number(result?.confidence || 0),
    startedAt: 0,
    source: 'unknown',
  };

  return {
    startListening,
    stopListening,
    startDetection,
    stopDetection,
    isListening,
    result,
    error,
    detectionState,
    cooldownState,
    detectionBuffer: detectionState.detectionBuffer,
    pendingAlert,
    cancelPendingAlert: () => {},
    allowPendingCountdown: () => {},
  };
};
