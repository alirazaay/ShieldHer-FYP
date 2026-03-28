import { useEffect, useRef, useCallback, useState } from 'react';
import { NativeModules, NativeEventEmitter, PermissionsAndroid, Platform } from 'react-native';
import logger from '../utils/logger';

const TAG = '[AI_DETECTION]';

export const DEFAULT_SCREAM_CONFIG = {
  confidenceThreshold: 0.8,
  requiredConsecutiveFrames: 3,
  validationWindowMs: 2000,
  cooldownMs: 60000,
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

export const useScreamDetection = ({ onScreamDetected, enabled = false, config = {} }) => {
  const runtimeConfig = { ...DEFAULT_SCREAM_CONFIG, ...config };
  const { ScreamDetection } = NativeModules;
  const emitter = ScreamDetection ? new NativeEventEmitter(ScreamDetection) : null;

  const confidenceListener = useRef(null);
  const alertListener = useRef(null);
  const isListeningRef = useRef(false);
  const mountedRef = useRef(true);

  const detectionBufferRef = useRef([]);
  const pendingCountdownIntervalRef = useRef(null);
  const lastTriggerTimeRef = useRef(0);
  const pendingAlertVisibleRef = useRef(false);

  const [detectionState, setDetectionState] = useState({
    isListening: false,
    lastConfidence: 0,
    trailingConsecutive: 0,
    lastEventAt: null,
    pendingConfirmation: false,
    detectionBuffer: [],
  });

  const [cooldownState, setCooldownState] = useState({
    isCoolingDown: false,
    lastTriggerTime: 0,
    remainingMs: 0,
  });

  const [pendingAlert, setPendingAlert] = useState({
    visible: false,
    countdownSec: runtimeConfig.confirmationCountdownSec,
    acknowledged: false,
    confidence: 0,
    startedAt: 0,
    source: 'unknown',
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

  const clearCountdownInterval = useCallback(() => {
    if (pendingCountdownIntervalRef.current) {
      clearInterval(pendingCountdownIntervalRef.current);
      pendingCountdownIntervalRef.current = null;
    }
  }, []);

  const beginCooldown = useCallback(() => {
    const nowTs = Date.now();
    lastTriggerTimeRef.current = nowTs;
    setCooldownState({
      isCoolingDown: true,
      lastTriggerTime: nowTs,
      remainingMs: runtimeConfig.cooldownMs,
    });
  }, [runtimeConfig.cooldownMs]);

  const runSOS = useCallback(
    async (triggerMeta) => {
      try {
        beginCooldown();

        const detectionDurationMs = triggerMeta.startedAt
          ? Date.now() - triggerMeta.startedAt
          : 0;

        logger.warn(
          TAG,
          'AI_DETECTION_EVENT',
          buildDetectionTelemetry({
            confidence: triggerMeta.confidence,
            timestamp: Date.now(),
            source: triggerMeta.source,
            trailingConsecutive: triggerMeta.trailingConsecutive,
            detectionDurationMs,
            triggeredSOS: true,
            cancelledByUser: false,
          })
        );

        if (onScreamDetected) {
          await onScreamDetected({
            label: 'scream',
            confidence: triggerMeta.confidence,
            timestamp: Date.now(),
            source: triggerMeta.source,
            trailingConsecutive: triggerMeta.trailingConsecutive,
          });
        }
      } catch (error) {
        logger.error(TAG, 'Failed to execute AI-triggered SOS', error);
      }
    },
    [beginCooldown, onScreamDetected]
  );

  const cancelPendingAlert = useCallback(() => {
    clearCountdownInterval();
    pendingAlertVisibleRef.current = false;

    setPendingAlert((prev) => {
      if (!prev.visible) return prev;

      const detectionDurationMs = prev.startedAt ? Date.now() - prev.startedAt : 0;
      logger.info(
        TAG,
        'AI_DETECTION_EVENT',
        buildDetectionTelemetry({
          confidence: prev.confidence,
          timestamp: Date.now(),
          source: prev.source,
          detectionDurationMs,
          triggeredSOS: false,
          cancelledByUser: true,
        })
      );

      return {
        visible: false,
        countdownSec: runtimeConfig.confirmationCountdownSec,
        acknowledged: false,
        confidence: 0,
        startedAt: 0,
        source: 'unknown',
      };
    });

    setDetectionState((prev) => ({ ...prev, pendingConfirmation: false }));
  }, [clearCountdownInterval, runtimeConfig.confirmationCountdownSec]);

  const allowPendingCountdown = useCallback(() => {
    setPendingAlert((prev) => ({ ...prev, acknowledged: true }));
  }, []);

  const startPendingConfirmation = useCallback(
    (eventMeta) => {
      pendingAlertVisibleRef.current = true;
      setPendingAlert({
        visible: true,
        countdownSec: runtimeConfig.confirmationCountdownSec,
        acknowledged: false,
        confidence: eventMeta.confidence,
        startedAt: Date.now(),
        source: eventMeta.source,
        trailingConsecutive: eventMeta.trailingConsecutive,
      });

      setDetectionState((prev) => ({ ...prev, pendingConfirmation: true }));

      clearCountdownInterval();
      pendingCountdownIntervalRef.current = setInterval(() => {
        setPendingAlert((prev) => {
          if (!prev.visible) return prev;

          if (prev.countdownSec <= 1) {
            clearCountdownInterval();
            pendingAlertVisibleRef.current = false;
            setDetectionState((statePrev) => ({ ...statePrev, pendingConfirmation: false }));
            runSOS({
              confidence: prev.confidence,
              source: prev.source,
              startedAt: prev.startedAt,
              trailingConsecutive: prev.trailingConsecutive || eventMeta.trailingConsecutive || 0,
            });

            return {
              visible: false,
              countdownSec: runtimeConfig.confirmationCountdownSec,
              acknowledged: false,
              confidence: 0,
              startedAt: 0,
              source: 'unknown',
              trailingConsecutive: 0,
            };
          }

          return {
            ...prev,
            countdownSec: prev.countdownSec - 1,
          };
        });
      }, 1000);
    },
    [clearCountdownInterval, runSOS, runtimeConfig.confirmationCountdownSec]
  );

  const processDetectionFrame = useCallback(
    (rawEvent, source) => {
      const parsed = normalizeScreamEvent(rawEvent, source);
      if (!parsed) {
        logger.debug(TAG, 'AI_DETECTION_EVENT', {
          eventType: 'AI_DETECTION_EVENT',
          source,
          timestamp: Date.now(),
          ignored: true,
          reason: 'invalid_or_missing_confidence',
        });
        return;
      }

      const nowTs = Date.now();
      if (isInCooldown(lastTriggerTimeRef.current, nowTs, runtimeConfig.cooldownMs)) {
        logger.debug(TAG, 'AI_DETECTION_EVENT', {
          eventType: 'AI_DETECTION_EVENT',
          source,
          timestamp: nowTs,
          confidence: parsed.confidence,
          triggeredSOS: false,
          cancelledByUser: false,
          ignored: true,
          reason: 'cooldown',
        });
        return;
      }

      detectionBufferRef.current.push(parsed);
      if (detectionBufferRef.current.length > runtimeConfig.maxBufferSize) {
        detectionBufferRef.current = detectionBufferRef.current.slice(-runtimeConfig.maxBufferSize);
      }

      const evaluation = evaluateConsecutiveFrames(
        detectionBufferRef.current,
        runtimeConfig.confidenceThreshold,
        runtimeConfig.requiredConsecutiveFrames,
        runtimeConfig.validationWindowMs,
        nowTs
      );

      detectionBufferRef.current = evaluation.recent;

      const nextDetectionState = {
        isListening: isListeningRef.current,
        lastConfidence: parsed.confidence,
        trailingConsecutive: evaluation.trailingConsecutive,
        lastEventAt: parsed.timestamp,
        pendingConfirmation: pendingAlertVisibleRef.current,
        detectionBuffer: [...detectionBufferRef.current],
      };
      setDetectionState(nextDetectionState);

      logger.debug(
        TAG,
        'AI_DETECTION_EVENT',
        buildDetectionTelemetry({
          confidence: parsed.confidence,
          timestamp: parsed.timestamp,
          source,
          trailingConsecutive: evaluation.trailingConsecutive,
          detectionDurationMs: 0,
          triggeredSOS: false,
          cancelledByUser: false,
        })
      );

      if (evaluation.shouldTrigger && !pendingAlertVisibleRef.current) {
        startPendingConfirmation({
          confidence: parsed.confidence,
          source,
          trailingConsecutive: evaluation.trailingConsecutive,
        });
      }
    },
    [
      runtimeConfig.cooldownMs,
      runtimeConfig.maxBufferSize,
      runtimeConfig.confidenceThreshold,
      runtimeConfig.requiredConsecutiveFrames,
      runtimeConfig.validationWindowMs,
      startPendingConfirmation,
    ]
  );

  const startDetection = useCallback(async () => {
    if (isListeningRef.current) return;

    if (!ScreamDetection || !emitter) {
      logger.warn(TAG, 'ScreamDetection native module is unavailable on this platform/build');
      return;
    }

    const hasPermission = await requestMicPermission();
    if (!hasPermission) {
      logger.warn(TAG, 'Microphone permission denied, AI detection not started');
      return;
    }

    confidenceListener.current = emitter.addListener('onScreamConfidence', (data) => {
      processDetectionFrame(data, 'onScreamConfidence');
    });

    alertListener.current = emitter.addListener('onScreamDetected', (data) => {
      processDetectionFrame(data, 'onScreamDetected');
    });

    await ScreamDetection.startListening();
    isListeningRef.current = true;
    setDetectionState((prev) => ({ ...prev, isListening: true }));
    logger.info(TAG, 'AI scream detection started');
  }, [ScreamDetection, emitter, processDetectionFrame, requestMicPermission]);

  const stopDetection = useCallback(async () => {
    if (!isListeningRef.current && !pendingAlert.visible) return;

    clearCountdownInterval();
    pendingAlertVisibleRef.current = false;

    try {
      if (ScreamDetection && isListeningRef.current) {
        await ScreamDetection.stopListening();
      }
    } catch (error) {
      logger.warn(TAG, 'stopListening failed', error?.message || error);
    }

    confidenceListener.current?.remove();
    alertListener.current?.remove();
    confidenceListener.current = null;
    alertListener.current = null;
    isListeningRef.current = false;
    detectionBufferRef.current = [];

    if (mountedRef.current) {
      setPendingAlert({
        visible: false,
        countdownSec: runtimeConfig.confirmationCountdownSec,
        acknowledged: false,
        confidence: 0,
        startedAt: 0,
        source: 'unknown',
      });
      setDetectionState({
        isListening: false,
        lastConfidence: 0,
        trailingConsecutive: 0,
        lastEventAt: null,
        pendingConfirmation: false,
        detectionBuffer: [],
      });
    }

    logger.info(TAG, 'AI scream detection stopped');
  }, [ScreamDetection, clearCountdownInterval, pendingAlert.visible, runtimeConfig.confirmationCountdownSec]);

  // Cooldown ticker
  useEffect(() => {
    if (!cooldownState.isCoolingDown) return undefined;

    const timer = setInterval(() => {
      const nowTs = Date.now();
      const remaining = Math.max(
        runtimeConfig.cooldownMs - (nowTs - cooldownState.lastTriggerTime),
        0
      );

      if (!mountedRef.current) return;

      if (remaining <= 0) {
        setCooldownState((prev) => ({
          ...prev,
          isCoolingDown: false,
          remainingMs: 0,
        }));
        clearInterval(timer);
        return;
      }

      setCooldownState((prev) => ({ ...prev, remainingMs: remaining }));
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldownState.isCoolingDown, cooldownState.lastTriggerTime, runtimeConfig.cooldownMs]);

  // Auto start/stop based on enabled prop
  useEffect(() => {
    if (enabled) {
      startDetection();
    } else {
      stopDetection();
    }
  }, [enabled, startDetection, stopDetection]);

  // Full cleanup
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopDetection();
    };
  }, [stopDetection]);

  return {
    startDetection,
    stopDetection,
    detectionState,
    cooldownState,
    detectionBuffer: detectionState.detectionBuffer,
    pendingAlert,
    cancelPendingAlert,
    allowPendingCountdown,
  };
};
