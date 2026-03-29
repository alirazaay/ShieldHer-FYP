import {
  collection,
  doc,
  setDoc,
  serverTimestamp,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import logger from '../utils/logger';

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return 0;
}

function sortAlertsByTimestampDesc(alerts) {
  return alerts.sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp));
}

// ─────────────────────────────────────────────────────────────────────────────
// Create an event in the alert's timeline
// @param {string} alertId - The target alert document ID
// @param {string} type - 'triggered' | 'responded' | 'resolved'
// @param {string} actorId - The UID of the user/guardian performing the action
// @param {object} metadata - Any extra details (e.g., location coordinates)
// @returns {Promise<void>}
// ─────────────────────────────────────────────────────────────────────────────
export async function createTimelineEvent(alertId, type, actorId, metadata = {}) {
  logger.info('[alertHistory]', `Creating timeline event: ${type} for alert ${alertId}`);

  if (!alertId || !type || !actorId) {
    logger.error('[alertHistory]', 'Missing required fields for timeline event');
    return;
  }

  try {
    const eventsCollectionRef = collection(db, 'alerts', alertId, 'events');
    const newEventRef = doc(eventsCollectionRef);

    await setDoc(newEventRef, {
      type,
      actorId,
      timestamp: serverTimestamp(),
      metadata,
    });

    logger.info('[alertHistory]', `Event "${type}" created successfully`);
  } catch (error) {
    // Failing to create an event shouldn't break the main flow (likeSOS trigger),
    // so we just log the error instead of throwing.
    logger.error('[alertHistory]', `Error creating "${type}" event:`, error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Get all historical alerts for a user or guardian
// @param {string} userId - The current user's UID
// @param {boolean} isGuardian - True if querying as a guardian for connected users
// @param {string[]} connectedUserIds - If guardian, array of user IDs they protect
// @param {Function} onUpdate - Callback for snapshot changes
// @param {Function} onError - Callback for errors
// @returns {Function} Unsubscribe function
// ─────────────────────────────────────────────────────────────────────────────
export function subscribeToAlertHistory(userId, isGuardian, connectedUserIds, onUpdate, onError) {
  logger.info('[alertHistory]', 'subscribeToAlertHistory', { userId, isGuardian });

  if (!userId) {
    onUpdate([]);
    return () => {};
  }

  try {
    const alertsRef = collection(db, 'alerts');
    let alertsQuery;

    if (isGuardian) {
      if (!connectedUserIds || connectedUserIds.length === 0) {
        onUpdate([]);
        return () => {};
      }
      alertsQuery = query(alertsRef, where('userId', 'in', connectedUserIds));
    } else {
      alertsQuery = query(alertsRef, where('userId', '==', userId));
    }

    const unsubscribe = onSnapshot(
      alertsQuery,
      (snapshot) => {
        const alerts = [];
        snapshot.forEach((docSnap) => {
          alerts.push({
            id: docSnap.id,
            ...docSnap.data(),
          });
        });

        const sortedAlerts = sortAlertsByTimestampDesc(alerts);

        logger.info('[alertHistory]', `Historic alerts loaded: ${sortedAlerts.length}`);
        onUpdate(sortedAlerts);
      },
      (error) => {
        logger.error('[alertHistory]', 'History snapshot error:', error);
        onError(error);
      }
    );

    return unsubscribe;
  } catch (error) {
    logger.error('[alertHistory]', 'History setup error:', error);
    onError(error);
    return () => {};
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Get all timeline events for a specific alert
// @param {string} alertId - The target alert document ID
// @param {Function} onUpdate - Callback for snapshot changes
// @param {Function} onError - Callback for errors
// @returns {Function} Unsubscribe function
// ─────────────────────────────────────────────────────────────────────────────
export function subscribeToAlertTimeline(alertId, onUpdate, onError) {
  logger.info('[alertHistory]', 'subscribeToAlertTimeline for alert:', alertId);

  if (!alertId) {
    onUpdate([]);
    return () => {};
  }

  try {
    const eventsRef = collection(db, 'alerts', alertId, 'events');
    const eventsQuery = query(eventsRef, orderBy('timestamp', 'asc'));

    const unsubscribe = onSnapshot(
      eventsQuery,
      (snapshot) => {
        const events = [];
        snapshot.forEach((docSnap) => {
          events.push({
            id: docSnap.id,
            ...docSnap.data(),
          });
        });

        logger.info('[alertHistory]', `Loaded ${events.length} timeline events`);
        onUpdate(events);
      },
      (error) => {
        logger.error('[alertHistory]', 'Timeline snapshot error:', error);
        onError(error);
      }
    );

    return unsubscribe;
  } catch (error) {
    logger.error('[alertHistory]', 'Timeline setup error:', error);
    onError(error);
    return () => {};
  }
}
