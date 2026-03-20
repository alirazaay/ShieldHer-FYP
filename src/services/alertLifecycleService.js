import {
  doc,
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  getDoc,
} from 'firebase/firestore';
import { db } from '../config/firebase';

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
  console.log('[alertLifecycle] subscribeToAlerts start', { userIds });

  if (!Array.isArray(userIds) || userIds.length === 0) {
    console.warn('[alertLifecycle] subscribeToAlerts: no userIds provided');
    onUpdate([]);
    return () => {};
  }

  // Firestore `in` queries support up to 30 values in SDK v9+
  // For FYP scale this is sufficient; for production chunk into batches of 30
  try {
    const alertsRef = collection(db, 'alerts');
    const alertsQuery = query(
      alertsRef,
      where('userId', 'in', userIds)
    );

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

        console.log(`[alertLifecycle] Alerts updated: ${alerts.length} total`);
        onUpdate(alerts);
      },
      (error) => {
        console.error('[alertLifecycle] Snapshot listener error:', error);
        onError(error);
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error('[alertLifecycle] subscribeToAlerts setup error:', error);
    onError(error);
    return () => {};
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Respond to an alert: sets status → "responding", stores respondedBy
//
// @param {string} alertId    - Firestore alert document ID
// @param {string} guardianId - Firebase Auth UID of the responding guardian
// @returns {Promise<void>}
// ─────────────────────────────────────────────────────────────────────────────
export async function respondToAlert(alertId, guardianId) {
  console.log('[alertLifecycle] respondToAlert', { alertId, guardianId });

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

    console.log('[alertLifecycle] respondToAlert: status set to responding');
  } catch (error) {
    console.error('[alertLifecycle] respondToAlert error:', error);
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
  console.log('[alertLifecycle] resolveAlert', { alertId, guardianId });

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
    if (currentStatus === 'resolved') {
      throw new Error('Alert is already resolved');
    }

    await updateDoc(alertRef, {
      status: 'resolved',
      resolvedBy: guardianId,
      resolvedAt: serverTimestamp(),
    });

    console.log('[alertLifecycle] resolveAlert: status set to resolved');
  } catch (error) {
    console.error('[alertLifecycle] resolveAlert error:', error);
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
  if (message.includes('Alert ID') || message.includes('Guardian ID')) return 'Authentication error. Please log in again.';

  const codeMap = {
    'permission-denied': 'You do not have permission to update this alert.',
    'not-found': 'Alert not found in database.',
    'unavailable': 'Service unavailable. Please try again.',
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
