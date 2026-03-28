import {
  doc,
  getDoc,
  setDoc,
  query,
  collection,
  where,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { handleAppError } from '../utils/errorHandler';
import logger from '../utils/logger';
import { isOnline } from './networkService';
import {
  sendOfflineEmergencySMS,
  cacheGuardiansForOffline,
  getSMSErrorMessage,
} from './smsService';
import { fetchGuardians, fetchUserProfile } from './profile';

const TAG = '[alertService]';

/**
 * Fetch user's current location from Firestore
 * Reads from the user document's location field (users/{uid}.location)
 * @param {string} userId - Firebase user ID
 * @returns {Promise<Object>} Location object {latitude, longitude, ...}
 */
export async function fetchUserLocation(userId) {
  try {
    if (!userId) throw new Error('User ID is required');

    // Read location from user document field (not subcollection)
    const userDocRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userDocRef);

    if (!userSnap.exists()) {
      throw new Error('User document not found');
    }

    const userData = userSnap.data();
    const location = userData?.location;

    if (!location || !location.latitude || !location.longitude) {
      throw new Error('User location not available');
    }

    return location;
  } catch (error) {
    handleAppError(error, 'Alert Service - Fetching Location');
    throw error;
  }
}

/**
 * Check if user has an active SOS alert within cooldown period (30 seconds)
 * @param {string} userId - Firebase user ID
 * @returns {Promise<boolean>} True if alert exists within cooldown, false otherwise
 */
export async function checkActiveAlert(userId) {
  try {
    if (!userId) throw new Error('User ID is required');

    const alertsCollectionRef = collection(db, 'alerts');
    const activeAlertQuery = query(
      alertsCollectionRef,
      where('userId', '==', userId),
      where('status', '==', 'active')
    );

    const alertSnap = await getDocs(activeAlertQuery);

    if (alertSnap.empty) {
      return false;
    }

    // Check if the most recent alert is within 30-second cooldown
    let hasRecentAlert = false;
    const now = Date.now();

    alertSnap.forEach((doc) => {
      const alertData = doc.data();
      const alertTimestamp = alertData.timestamp?.toMillis?.() || alertData.timestamp || 0;
      const timeSinceAlert = now - alertTimestamp;

      if (timeSinceAlert < 30000) {
        // 30 seconds in milliseconds
        hasRecentAlert = true;
      }
    });

    return hasRecentAlert;
  } catch (error) {
    handleAppError(error, 'Alert Service - Checking Active Alerts');
    // If there's an error checking, allow the alert to proceed (fail open)
    return false;
  }
}

import { createTimelineEvent } from './alertHistoryService';

/**
 * Create a new SOS alert in Firestore
 * @param {string} userId - Firebase user ID
 * @param {number} latitude - User's latitude
 * @param {number} longitude - User's longitude
 * @param {number} accuracy - GPS accuracy (optional)
 * @returns {Promise<string>} Alert document ID
 */
export async function createAlert(userId, latitude, longitude, accuracy = null) {
  try {
    if (!userId) throw new Error('User ID is required');
    if (latitude === undefined || longitude === undefined) {
      throw new Error('Location coordinates are required');
    }

    // Create alert document
    const alertsCollectionRef = collection(db, 'alerts');
    const newAlertRef = doc(alertsCollectionRef);

    const alertData = {
      userId,
      alertType: 'SOS',
      latitude,
      longitude,
      accuracy: accuracy || null,
      timestamp: serverTimestamp(),
      status: 'active',
      createdAt: serverTimestamp(),
    };

    await setDoc(newAlertRef, alertData);

    console.log('[alertService] SOS alert created successfully:', newAlertRef.id);

    // [Timeline hook] Record the trigger event in the alert's subcollection
    await createTimelineEvent(newAlertRef.id, 'triggered', userId, {
      latitude,
      longitude,
      accuracy,
    });

    return newAlertRef.id;
  } catch (error) {
    handleAppError(error, 'Alert Service - Creating SOS Alert');
    throw error;
  }
}

/**
 * Map Firebase/alert errors to user-friendly messages
 * @param {Error} error - Error object
 * @returns {string} User-friendly error message
 */
export function getAlertErrorMessage(error) {
  const errorCodeMap = {
    'permission-denied': 'You do not have permission to create alerts',
    'not-found': 'User location data not found',
    unavailable: 'Service unavailable. Please try again later.',
    'network-request-failed': 'Network connection failed. Check your internet.',
  };

  const message = error.message || '';

  // Check for custom errors
  if (message.includes('User ID is required')) {
    return 'Authentication error. Please log in again.';
  }

  if (message.includes('Location coordinates are required')) {
    return 'Location not available. Enable location services.';
  }

  if (message.includes('location not available')) {
    return 'Location not available. Ensure location tracking is enabled.';
  }

  // Check for Firebase error codes
  const code = error.code || message;
  return errorCodeMap[code] || message || 'Failed to send alert. Please try again.';
}

// ─────────────────────────────────────────────────────────────────────────────
// Offline-Aware SOS Dispatch (with SMS Fallback)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dispatch SOS alert with automatic SMS fallback when offline
 *
 * This is the primary entry point for triggering SOS alerts. It:
 * 1. Checks device connectivity
 * 2. If ONLINE: Creates Firestore alert (triggers FCM via cloud function)
 * 3. If OFFLINE: Sends SMS to all guardians with stored phone numbers
 *
 * @param {string} userId - Firebase user ID
 * @param {Object} location - Location object {latitude, longitude, accuracy}
 * @returns {Promise<Object>} Result with alertId (if online) or smsResult (if offline)
 */
export async function dispatchSOSAlert(userId, location) {
  const result = {
    success: false,
    method: null, // 'firestore' or 'sms'
    alertId: null,
    smsResult: null,
    error: null,
  };

  try {
    if (!userId) {
      throw new Error('User ID is required');
    }

    if (!location || !location.latitude || !location.longitude) {
      throw new Error('Location coordinates are required');
    }

    // Check connectivity
    const deviceOnline = await isOnline();
    logger.info(TAG, `SOS dispatch initiated - Online: ${deviceOnline}`);

    if (deviceOnline) {
      // ─────────────────────────────────────────────────────────────────────
      // ONLINE PATH: Use Firestore + FCM
      // ─────────────────────────────────────────────────────────────────────
      result.method = 'firestore';

      try {
        const alertId = await createAlert(
          userId,
          location.latitude,
          location.longitude,
          location.accuracy
        );

        result.success = true;
        result.alertId = alertId;
        logger.info(TAG, `SOS alert created via Firestore: ${alertId}`);

        // Proactively cache guardians for future offline scenarios
        try {
          const guardians = await fetchGuardians(userId);
          await cacheGuardiansForOffline(userId, guardians);
        } catch (cacheError) {
          logger.warn(TAG, 'Failed to cache guardians:', cacheError.message);
        }

        return result;
      } catch (firestoreError) {
        // Firestore write failed - may be a transient network issue
        // Fall through to SMS fallback
        logger.warn(TAG, 'Firestore alert failed, falling back to SMS:', firestoreError.message);
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // OFFLINE PATH (or Firestore failure): Use SMS Fallback
    // ─────────────────────────────────────────────────────────────────────
    result.method = 'sms';
    logger.info(TAG, 'Initiating SMS fallback for SOS alert');

    // Fetch user name for personalized message
    let userName = null;
    try {
      const profile = await fetchUserProfile(userId);
      userName = profile?.name || profile?.displayName || null;
    } catch {
      logger.debug(TAG, 'Could not fetch user profile for SMS');
    }

    // Send SMS to all guardians
    const smsResult = await sendOfflineEmergencySMS(userId, location, userName);
    result.smsResult = smsResult;

    if (smsResult.sent > 0) {
      result.success = true;
      logger.info(TAG, `SMS fallback succeeded: ${smsResult.sent} message(s) sent`);
    } else {
      result.error = getSMSErrorMessage(smsResult);
      logger.error(TAG, 'SMS fallback failed:', result.error);
    }

    return result;
  } catch (error) {
    logger.error(TAG, 'dispatchSOSAlert fatal error:', error);
    result.error = error.message;
    handleAppError(error, 'Alert Service - SOS Dispatch');
    return result;
  }
}

/**
 * Pre-cache guardians for offline SMS fallback
 * Call this when the user logs in or when guardians are updated
 * @param {string} userId - Firebase user ID
 */
export async function prepareOfflineFallback(userId) {
  try {
    const online = await isOnline();
    if (!online) {
      logger.debug(TAG, 'Skipping offline fallback prep - device offline');
      return;
    }

    const guardians = await fetchGuardians(userId);
    await cacheGuardiansForOffline(userId, guardians);
    logger.info(TAG, `Offline fallback prepared: ${guardians.length} guardian(s) cached`);
  } catch (error) {
    logger.warn(TAG, 'prepareOfflineFallback error:', error.message);
  }
}
