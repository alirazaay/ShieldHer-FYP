import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import logger from '../utils/logger';
import { initializeEmergencyCallService, showIncomingEmergencyCall } from './emergencyCallService';
import { startEmergencyAlarm, stopEmergencyAlarm } from './emergencyAlarmService';

const TAG = '[guardianEmergencyListener]';
const PENDING_ALERTS_KEY = '@shieldher_pending_guardian_alerts';

let notificationReceivedSub = null;
let notificationResponseSub = null;
let inboxUnsubscribe = null;
let navigationHandler = null;
const recentAlerts = new Map();

function normalizeEmergencyPayload(raw = {}) {
  if (!raw) return null;

  const eventType = raw.eventType || raw.alertType;
  if (eventType !== 'SOS_CALL' && eventType !== 'SOS') {
    return null;
  }

  const alertId = raw.alertId || null;
  const userId = raw.userId || null;

  if (!alertId || !userId) {
    return null;
  }

  return {
    alertId,
    userId,
    userName: raw.userName || 'ShieldHer User',
    triggerType: raw.triggerType === 'AI' ? 'AI' : 'manual',
    latitude: raw.latitude != null ? Number(raw.latitude) : null,
    longitude: raw.longitude != null ? Number(raw.longitude) : null,
    locationLink: raw.locationLink || '',
    inboxDocId: raw.inboxDocId || null,
  };
}

async function loadPendingAlerts() {
  try {
    const raw = await AsyncStorage.getItem(PENDING_ALERTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    logger.error(TAG, 'Failed to load cached pending alerts:', error);
    return [];
  }
}

async function savePendingAlerts(list) {
  try {
    await AsyncStorage.setItem(PENDING_ALERTS_KEY, JSON.stringify(list));
  } catch (error) {
    logger.error(TAG, 'Failed to save pending alerts:', error);
  }
}

async function cachePendingAlert(payload) {
  const current = await loadPendingAlerts();
  const exists = current.some((item) => item.alertId === payload.alertId);
  if (exists) return;

  current.push({
    ...payload,
    cachedAt: Date.now(),
  });

  await savePendingAlerts(current);
}

async function removeCachedAlert(alertId) {
  const current = await loadPendingAlerts();
  const next = current.filter((item) => item.alertId !== alertId);
  await savePendingAlerts(next);
}

function shouldProcessAlert(alertId) {
  const now = Date.now();
  const lastSeen = recentAlerts.get(alertId) || 0;
  if (now - lastSeen < 5000) {
    return false;
  }

  recentAlerts.set(alertId, now);
  return true;
}

async function updateInboxDoc(inboxDocId, updates) {
  if (!inboxDocId) return;

  try {
    await updateDoc(doc(db, 'guardianAlertInbox', inboxDocId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    logger.warn(TAG, 'Failed updating guardian inbox doc:', error?.message || error);
  }
}

function navigate(screen, params) {
  if (typeof navigationHandler !== 'function') {
    return;
  }

  navigationHandler(screen, params);
}

export async function acceptIncomingEmergency(payload) {
  await stopEmergencyAlarm();

  await updateInboxDoc(payload?.inboxDocId, {
    status: 'accepted',
    callAcceptedAt: serverTimestamp(),
    pushAckAt: serverTimestamp(),
  });

  await removeCachedAlert(payload?.alertId);

  navigate('UserLocationMap', {
    userId: payload?.userId,
    alertId: payload?.alertId,
    latitude: payload?.latitude,
    longitude: payload?.longitude,
  });
}

export async function declineIncomingEmergency(payload) {
  await stopEmergencyAlarm();

  await updateInboxDoc(payload?.inboxDocId, {
    status: 'declined',
    callDeclinedAt: serverTimestamp(),
    pushAckAt: serverTimestamp(),
  });

  await removeCachedAlert(payload?.alertId);
}

async function handleEmergencyPayload(payload, source = 'push') {
  if (!payload || !shouldProcessAlert(payload.alertId)) {
    return false;
  }

  await cachePendingAlert(payload);

  await updateInboxDoc(payload.inboxDocId, {
    status: 'ringing',
    pushAckAt: serverTimestamp(),
    source,
  });

  await startEmergencyAlarm({
    title: 'ShieldHer Emergency',
    message: `${payload.userName} needs help now.`,
  });

  const callResult = await showIncomingEmergencyCall(payload);
  if (!callResult?.shown) {
    navigate('IncomingSOSCall', { payload });
  }

  return true;
}

async function replayCachedAlerts() {
  const cached = await loadPendingAlerts();
  for (const payload of cached) {
    if (!payload?.alertId || !payload?.userId) continue;
    await handleEmergencyPayload(payload, 'cached');
  }
}

function bindNotificationListeners() {
  if (!notificationReceivedSub) {
    notificationReceivedSub = Notifications.addNotificationReceivedListener(
      async (notification) => {
        const payload = normalizeEmergencyPayload(notification?.request?.content?.data);
        if (!payload) return;

        await handleEmergencyPayload(payload, 'foreground');
      }
    );
  }

  if (!notificationResponseSub) {
    notificationResponseSub = Notifications.addNotificationResponseReceivedListener(
      async (response) => {
        const payload = normalizeEmergencyPayload(response?.notification?.request?.content?.data);
        if (!payload) return;

        await handleEmergencyPayload(payload, 'response');
      }
    );
  }
}

function bindGuardianInboxListener(guardianId) {
  if (!guardianId) return;

  if (inboxUnsubscribe) {
    inboxUnsubscribe();
  }

  const inboxQuery = query(
    collection(db, 'guardianAlertInbox'),
    where('guardianId', '==', guardianId),
    where('status', '==', 'pending')
  );

  inboxUnsubscribe = onSnapshot(
    inboxQuery,
    async (snapshot) => {
      for (const docSnap of snapshot.docs) {
        const payload = normalizeEmergencyPayload({
          ...(docSnap.data() || {}),
          eventType: 'SOS_CALL',
          inboxDocId: docSnap.id,
        });

        if (!payload) continue;
        await handleEmergencyPayload(payload, 'inbox');
      }
    },
    (error) => {
      logger.error(TAG, 'Guardian inbox listener failed:', error);
    }
  );
}

export async function initializeGuardianEmergencyListener({ guardianId, onNavigate } = {}) {
  if (!guardianId) {
    return () => {};
  }

  navigationHandler = onNavigate || null;

  await initializeEmergencyCallService({
    onAccept: async ({ payload }) => {
      await acceptIncomingEmergency(payload);
    },
    onDecline: async ({ payload }) => {
      await declineIncomingEmergency(payload);
    },
  });

  bindNotificationListeners();
  bindGuardianInboxListener(guardianId);

  try {
    const lastResponse = await Notifications.getLastNotificationResponseAsync();
    const payload = normalizeEmergencyPayload(lastResponse?.notification?.request?.content?.data);
    if (payload) {
      await handleEmergencyPayload(payload, 'startup-response');
    }
  } catch (error) {
    logger.warn(TAG, 'Failed reading startup notification response:', error?.message || error);
  }

  await replayCachedAlerts();

  logger.info(TAG, 'Guardian emergency listener initialized');

  return () => {
    if (notificationReceivedSub) {
      notificationReceivedSub.remove();
      notificationReceivedSub = null;
    }
    if (notificationResponseSub) {
      notificationResponseSub.remove();
      notificationResponseSub = null;
    }
    if (inboxUnsubscribe) {
      inboxUnsubscribe();
      inboxUnsubscribe = null;
    }
    navigationHandler = null;
  };
}
