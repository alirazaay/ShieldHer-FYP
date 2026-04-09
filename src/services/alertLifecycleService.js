import {
  doc,
  collection,
  setDoc,
  query,
  where,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  getDoc,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import logger from '../utils/logger';
import { stopLocationTracking } from './locationListener';

// ─────────────────────────────────────────────────────────────────────────────
// Subscribe to real-time alerts for a set of users (guardian's connected users)
// Uses Firestore onSnapshot for live updates.
//
// @param {string[]} userIds       - Array of connected user IDs to watch
// @param {Function} onUpdate      - Callback: (alerts: object[]) => void
//                                   Receives ALL alerts; caller filters by status
// @param {Function} onError       - Callback: (error: Error) => void
// @returns {Function}             - Unsubscribe function
// ─────────────────────────────────────────────────────────────────────────────
export function subscribeToAlerts(userIds, onUpdate, onError) {
  logger.info('[alertLifecycle]', 'subscribeToAlerts start', {
    userCount: Array.isArray(userIds) ? userIds.length : 0,
  });

  if (!Array.isArray(userIds) || userIds.length === 0) {
    logger.warn('[alertLifecycle]', 'subscribeToAlerts: no userIds provided');
    onUpdate([]);
    return () => {};
  }

  // Firestore `in` queries support up to 30 values in SDK v9+
  // For FYP scale this is sufficient; for production chunk into batches of 30
  try {
    const alertsRef = collection(db, 'alerts');
    const alertsQuery = query(alertsRef, where('userId', 'in', userIds));

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

        // Sort by timestamp descending (newest first)
        alerts.sort((a, b) => {
          const tsA = a.timestamp?.toMillis?.() ?? a.timestamp ?? 0;
          const tsB = b.timestamp?.toMillis?.() ?? b.timestamp ?? 0;
          return tsB - tsA;
        });

        logger.info('[alertLifecycle]', `Alerts updated: ${alerts.length} total`);
        onUpdate(alerts);
      },
      (error) => {
        logger.error('[alertLifecycle]', 'Snapshot listener error:', error);
        onError(error);
      }
    );

    return unsubscribe;
  } catch (error) {
    logger.error('[alertLifecycle]', 'subscribeToAlerts setup error:', error);
    onError(error);
    return () => {};
  }
}

import { createTimelineEvent } from './alertHistoryService';

// ─────────────────────────────────────────────────────────────────────────────
// Respond to an alert: sets status → "responding", stores respondedBy
//
// @param {string} alertId    - Firestore alert document ID
// @param {string} guardianId - Firebase Auth UID of the responding guardian
// @returns {Promise<void>}
// ─────────────────────────────────────────────────────────────────────────────
export async function respondToAlert(alertId, guardianId) {
  logger.info('[alertLifecycle]', 'respondToAlert', { alertId, guardianId });

  if (!alertId || !guardianId) {
    throw new Error('Alert ID and Guardian ID are required');
  }

  try {
    const alertRef = doc(db, 'alerts', alertId);

    // Guard: verify alert exists and is still active
    const alertSnap = await getDoc(alertRef);
    if (!alertSnap.exists()) {
      throw new Error('Alert not found');
    }

    const currentStatus = alertSnap.data().status;
    if (currentStatus !== 'active') {
      throw new Error(`Alert is already "${currentStatus}"`);
    }

    await updateDoc(alertRef, {
      status: 'responding',
      respondedBy: guardianId,
      respondedAt: serverTimestamp(),
    });

    logger.info('[alertLifecycle]', 'respondToAlert: status set to responding');

    // [Timeline hook] Record the response event in the alert's subcollection
    await createTimelineEvent(alertId, 'responded', guardianId);
  } catch (error) {
    logger.error('[alertLifecycle]', 'respondToAlert error:', error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolve an alert: sets status → "resolved", stores resolvedAt timestamp
//
// @param {string} alertId    - Firestore alert document ID
// @param {string} guardianId - Firebase Auth UID of the resolving guardian
// @returns {Promise<void>}
// ─────────────────────────────────────────────────────────────────────────────
export async function resolveAlert(alertId, guardianId) {
  logger.info('[alertLifecycle]', 'resolveAlert', { alertId, guardianId });

  if (!alertId || !guardianId) {
    throw new Error('Alert ID and Guardian ID are required');
  }

  try {
    const alertRef = doc(db, 'alerts', alertId);

    // Guard: verify alert exists and is not already resolved
    const alertSnap = await getDoc(alertRef);
    if (!alertSnap.exists()) {
      throw new Error('Alert not found');
    }

    const currentStatus = alertSnap.data().status;
    if (currentStatus === 'cancelled') {
      throw new Error('Alert has been cancelled by the user');
    }
    if (currentStatus === 'resolved') {
      throw new Error('Alert is already resolved');
    }

    await updateDoc(alertRef, {
      status: 'resolved',
      resolvedBy: guardianId,
      resolvedAt: serverTimestamp(),
    });

    logger.info('[alertLifecycle]', 'resolveAlert: status set to resolved');

    // [Timeline hook] Record the resolution event in the alert's subcollection
    await createTimelineEvent(alertId, 'resolved', guardianId);

    // Stop active SOS location tracking loop in this runtime.
    stopLocationTracking('alert-resolved');
  } catch (error) {
    logger.error('[alertLifecycle]', 'resolveAlert error:', error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cancel an alert by the owner: sets status → "cancelled"
//
// @param {string} alertId  - Firestore alert document ID
// @param {string} userId   - Firebase Auth UID of the alert owner
// @returns {Promise<void>}
// ─────────────────────────────────────────────────────────────────────────────
export async function cancelAlert(alertId, userId) {
  logger.info('[alertLifecycle]', 'cancelAlert', { alertId, userId });

  if (!alertId || !userId) {
    throw new Error('Alert ID and User ID are required');
  }

  try {
    const alertRef = doc(db, 'alerts', alertId);

    // Guard: verify alert exists and ownership
    const alertSnap = await getDoc(alertRef);
    if (!alertSnap.exists()) {
      throw new Error('Alert not found');
    }

    const alertData = alertSnap.data() || {};
    const ownerId = alertData.ownerId || alertData.userId;
    if (!ownerId || ownerId !== userId) {
      throw new Error('Only the alert owner can cancel this alert');
    }

    const currentStatus = alertData.status;
    if (currentStatus === 'cancelled') {
      throw new Error('Alert is already cancelled');
    }
    if (currentStatus === 'resolved') {
      throw new Error('Resolved alerts cannot be cancelled');
    }

    await updateDoc(alertRef, {
      status: 'cancelled',
      cancelledAt: serverTimestamp(),
    });

    logger.info('[alertLifecycle]', 'cancelAlert: status set to cancelled');

    // Audit trail: explicit cancellation event contract
    const eventsCollectionRef = collection(db, 'alerts', alertId, 'events');
    const cancellationEventRef = doc(eventsCollectionRef);
    await setDoc(cancellationEventRef, {
      type: 'alert_cancelled',
      actor: userId,
      actorId: userId,
      timestamp: serverTimestamp(),
    });

    // Stop active SOS location tracking loop in this runtime.
    stopLocationTracking('alert-cancelled');
  } catch (error) {
    logger.error('[alertLifecycle]', 'cancelAlert error:', error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Map errors to user-friendly messages
// @param {Error} error
// @returns {string}
// ─────────────────────────────────────────────────────────────────────────────
export function getAlertLifecycleErrorMessage(error) {
  const message = error?.message || '';

  if (message.includes('Alert not found')) return 'Alert no longer exists.';
  if (message.includes('already "responding"')) return 'This alert is already being responded to.';
  if (message.includes('already resolved')) return 'This alert has already been resolved.';
  if (message.includes('already cancelled')) return 'This alert has already been cancelled.';
  if (message.includes('cannot be cancelled')) return 'This alert can no longer be cancelled.';
  if (message.includes('Only the alert owner can cancel'))
    return 'Only the alert owner can cancel this alert.';
  if (message.includes('has been cancelled')) return 'This alert has been cancelled by the user.';
  if (message.includes('Alert ID') || message.includes('Guardian ID'))
    return 'Authentication error. Please log in again.';

  const codeMap = {
    'permission-denied': 'You do not have permission to update this alert.',
    'not-found': 'Alert not found in database.',
    unavailable: 'Service unavailable. Please try again.',
    'network-request-failed': 'Network error. Check your connection.',
  };

  return codeMap[error?.code] || message || 'Failed to update alert. Please try again.';
}

// ─────────────────────────────────────────────────────────────────────────────
// Format a Firestore timestamp into a human-readable relative string
// @param {any} timestamp - Firestore Timestamp, number, or null
// @returns {string}
// ─────────────────────────────────────────────────────────────────────────────
export function formatAlertTime(timestamp) {
  if (!timestamp) return 'Unknown time';

  let date;
  if (typeof timestamp === 'number') {
    date = new Date(timestamp);
  } else if (timestamp?.toDate) {
    date = timestamp.toDate();
  } else if (timestamp?.toMillis) {
    date = new Date(timestamp.toMillis());
  } else {
    return 'Unknown time';
  }

  const now = new Date();
  const diffSeconds = Math.floor((now - date) / 1000);

  if (diffSeconds < 60) return 'Just now';
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
  return date.toLocaleDateString();
}
