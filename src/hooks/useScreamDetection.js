import { useEffect, useRef, useCallback } from 'react';
import { NativeModules, NativeEventEmitter, PermissionsAndroid, Platform } from 'react-native';

const { ScreamDetection } = NativeModules;
const emitter = new NativeEventEmitter(ScreamDetection);

export const useScreamDetection = ({ onScreamDetected, enabled = false }) => {
  const confidenceListener = useRef(null);
  const alertListener = useRef(null);
  const isListening = useRef(false);

  const requestMicPermission = async () => {
    if (Platform.OS !== 'android') return true;
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
      title: 'ShieldHer Microphone Permission',
      message: 'ShieldHer needs mic access to detect screams and trigger SOS.',
      buttonPositive: 'Allow',
    });
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  };

  const start = useCallback(async () => {
    if (isListening.current) return;

    const hasPermission = await requestMicPermission();
    if (!hasPermission) {
      console.warn('[ScreamDetection] Mic permission denied');
      return;
    }

    // Listen for every confidence update (optional — for UI display)
    confidenceListener.current = emitter.addListener('onScreamConfidence', (data) => {
      // data = { confidence: 0.92, isScream: true }
      // Use this to show a live confidence indicator in UI if needed
    });

    // Listen for scream alert (this triggers SOS)
    alertListener.current = emitter.addListener('onScreamDetected', (data) => {
      console.warn('[ScreamDetection] 🚨 Scream detected:', data.confidence);
      if (onScreamDetected) onScreamDetected(data);
    });

    await ScreamDetection.startListening();
    isListening.current = true;
    console.log('[ScreamDetection] ▶ Started');
  }, [onScreamDetected]);

  const stop = useCallback(async () => {
    if (!isListening.current) return;
    await ScreamDetection.stopListening();
    confidenceListener.current?.remove();
    alertListener.current?.remove();
    isListening.current = false;
    console.log('[ScreamDetection] ⏹ Stopped');
  }, []);

  // Auto start/stop based on enabled prop
  useEffect(() => {
    if (enabled) {
      start();
    } else {
      stop();
    }
    return () => {
      stop();
    };
  }, [enabled, start, stop]);

  return { start, stop };
};
