import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../config/firebase';

const DEFAULT_ALARM_SRC = '/sounds/police-siren.mp3';

function isCriticalAlert(alert) {
  const severity = String(alert?.severity || alert?.priority || '').toLowerCase();
  return severity === 'critical' || severity === 'high';
}

function normalizePoliceAlert(docSnap) {
  const data = docSnap.data() || {};

  return {
    id: docSnap.id,
    ...data,
    userName: data.userName || data.name || 'Unknown User',
    severity: data.severity || data.priority || 'high',
    latitude: Number(data?.userLocation?.latitude ?? data?.latitude ?? NaN),
    longitude: Number(data?.userLocation?.longitude ?? data?.longitude ?? NaN),
    locationAccuracy: Number(data?.userLocation?.accuracy ?? data?.accuracy ?? NaN),
  };
}

function formatLocation(alert) {
  const hasCoordinates = Number.isFinite(alert?.latitude) && Number.isFinite(alert?.longitude);
  if (!hasCoordinates) return 'Location unavailable';

  return `${alert.latitude.toFixed(5)}, ${alert.longitude.toFixed(5)}`;
}

function buildNotificationText(alert) {
  const level = isCriticalAlert(alert) ? 'CRITICAL' : 'Emergency';
  return `${level} alert for ${alert.userName}. Location: ${formatLocation(alert)}`;
}

export default function usePoliceAlertNotifications(options = {}) {
  const { alarmSrc = DEFAULT_ALARM_SRC, onAcceptAlert, onDismissAlert } = options;

  const [activeAlert, setActiveAlert] = useState(null);
  const [queuedAlerts, setQueuedAlerts] = useState([]);
  const [isAudioBlocked, setIsAudioBlocked] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState(
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'unsupported'
  );

  const audioRef = useRef(null);
  const activeAlertRef = useRef(null);
  const initializedRef = useRef(false);
  const seenAlertIdsRef = useRef(new Set());

  useEffect(() => {
    activeAlertRef.current = activeAlert;
  }, [activeAlert]);

  const stopAlarm = useCallback(() => {
    const alarmAudio = audioRef.current;
    if (!alarmAudio) return;

    alarmAudio.pause();
    alarmAudio.currentTime = 0;
  }, []);

  const playAlarm = useCallback(async () => {
    const alarmAudio = audioRef.current;
    if (!alarmAudio) return;

    try {
      alarmAudio.currentTime = 0;
      await alarmAudio.play();
      setIsAudioBlocked(false);
    } catch {
      // Browser blocked autoplay; user interaction fallback will be shown.
      setIsAudioBlocked(true);
    }
  }, []);

  const requestBrowserNotificationPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationPermission('unsupported');
      return 'unsupported';
    }

    if (Notification.permission !== 'default') {
      setNotificationPermission(Notification.permission);
      return Notification.permission;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    return permission;
  }, []);

  const showBrowserNotification = useCallback(
    async (alert) => {
      if (typeof window === 'undefined' || !('Notification' in window)) return;

      let permission = Notification.permission;
      if (permission !== 'granted') {
        permission = await requestBrowserNotificationPermission();
      }

      if (permission !== 'granted') return;

      const critical = isCriticalAlert(alert);
      const notification = new Notification(
        critical ? 'CRITICAL Police Emergency Alert' : 'New Police Emergency Alert',
        {
          body: buildNotificationText(alert),
          tag: `police-alert-${alert.id}`,
          requireInteraction: critical,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
        }
      );

      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    },
    [requestBrowserNotificationPermission]
  );

  const vibrateDevice = useCallback((alert) => {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;

    const pattern = isCriticalAlert(alert) ? [300, 120, 300, 120, 600] : [200, 100, 200];

    navigator.vibrate(pattern);
  }, []);

  const triggerEmergencyEffects = useCallback(
    (alert) => {
      vibrateDevice(alert);
      showBrowserNotification(alert);
      playAlarm();
    },
    [playAlarm, showBrowserNotification, vibrateDevice]
  );

  const showNextQueuedAlert = useCallback(() => {
    setQueuedAlerts((prevQueue) => {
      if (prevQueue.length === 0) {
        setActiveAlert(null);
        return prevQueue;
      }

      const [nextAlert, ...rest] = prevQueue;
      setActiveAlert(nextAlert);
      triggerEmergencyEffects(nextAlert);
      return rest;
    });
  }, [triggerEmergencyEffects]);

  const acceptCurrentAlert = useCallback(() => {
    const current = activeAlertRef.current;
    if (!current) return;

    stopAlarm();
    if (typeof onAcceptAlert === 'function') {
      onAcceptAlert(current);
    }

    showNextQueuedAlert();
  }, [onAcceptAlert, showNextQueuedAlert, stopAlarm]);

  const dismissCurrentAlert = useCallback(() => {
    const current = activeAlertRef.current;
    if (!current) return;

    stopAlarm();
    if (typeof onDismissAlert === 'function') {
      onDismissAlert(current);
    }

    showNextQueuedAlert();
  }, [onDismissAlert, showNextQueuedAlert, stopAlarm]);

  const enableAlarmAfterGesture = useCallback(async () => {
    await playAlarm();
  }, [playAlarm]);

  const enqueueAlert = useCallback(
    (alert) => {
      if (activeAlertRef.current) {
        setQueuedAlerts((prevQueue) => {
          const alreadyQueued = prevQueue.some((queuedAlert) => queuedAlert.id === alert.id);
          return alreadyQueued ? prevQueue : [...prevQueue, alert];
        });
        return;
      }

      setActiveAlert(alert);
      triggerEmergencyEffects(alert);
    },
    [triggerEmergencyEffects]
  );

  useEffect(() => {
    const alarmAudio = new Audio(alarmSrc);
    alarmAudio.loop = true;
    alarmAudio.preload = 'auto';
    alarmAudio.volume = 1;
    audioRef.current = alarmAudio;

    return () => {
      stopAlarm();
      audioRef.current = null;
    };
  }, [alarmSrc, stopAlarm]);

  useEffect(() => {
    const policeAlertsQuery = query(collection(db, 'policeAlerts'), orderBy('escalatedAt', 'desc'));

    const unsubscribe = onSnapshot(policeAlertsQuery, (snapshot) => {
      // Prime the seen set on first load so existing docs do not trigger alerts.
      if (!initializedRef.current) {
        snapshot.docs.forEach((docSnap) => {
          seenAlertIdsRef.current.add(docSnap.id);
        });
        initializedRef.current = true;
        return;
      }

      snapshot.docChanges().forEach((change) => {
        if (change.type !== 'added') return;

        const alertId = change.doc.id;
        if (seenAlertIdsRef.current.has(alertId)) return;

        seenAlertIdsRef.current.add(alertId);
        enqueueAlert(normalizePoliceAlert(change.doc));
      });
    });

    return () => unsubscribe();
  }, [enqueueAlert]);

  useEffect(() => {
    if (!isAudioBlocked || !activeAlert) return undefined;

    const onFirstInteraction = () => {
      playAlarm();
    };

    window.addEventListener('pointerdown', onFirstInteraction, { once: true, capture: true });
    window.addEventListener('keydown', onFirstInteraction, { once: true, capture: true });

    return () => {
      window.removeEventListener('pointerdown', onFirstInteraction, { capture: true });
      window.removeEventListener('keydown', onFirstInteraction, { capture: true });
    };
  }, [activeAlert, isAudioBlocked, playAlarm]);

  return {
    activeAlert,
    isModalOpen: Boolean(activeAlert),
    queuedCount: queuedAlerts.length,
    isCriticalActiveAlert: isCriticalAlert(activeAlert),
    isAudioBlocked,
    notificationPermission,
    acceptCurrentAlert,
    dismissCurrentAlert,
    enableAlarmAfterGesture,
    requestBrowserNotificationPermission,
    seenAlertIdsRef,
  };
}
