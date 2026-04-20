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
import { createTimelineEvent } from './alertHistoryService';
import {
  sendOfflineEmergencySMS,
  cacheGuardiansForOffline,
  getSMSErrorMessage,
} from './smsService';
import { fetchGuardians, fetchUserProfile } from './profile';
import {
  enqueuePendingAlert,
  initializeAlertRetryQueue,
  retryPendingAlertsNow,
  shutdownAlertRetryQueue,
} from './alertRetryQueue';
import { getCachedLocation, getCurrentLocation } from './location';
import { startLocationTracking } from './locationListener';

const TAG = '[alertService]';
let retryQueueReady = false;

function normalizeTriggerType(triggerType) {
  return triggerType === 'AI' || triggerType === 'AI_DETECTION' ? 'AI' : 'manual';
}

function buildAlertPayload(userId, location, triggerType = 'manual', metadata = {}) {
  const payload = {
    userId,
    ownerId: userId, // Canonical owner field for Firestore rules (alertOwnerId helper)
    alertType: 'SOS',
    type: normalizeTriggerType(triggerType),
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: location.accuracy || null,
    timestamp: serverTimestamp(),
    status: 'active',
    createdAt: serverTimestamp(),
  };

  if (metadata?.source) {
    payload.source = metadata.source;
  }

  if (metadata?.detectedAt) {
    payload.detectedAt = metadata.detectedAt;
  }

  if (Number.isFinite(Number(metadata?.confidence))) {
    payload.confidence = Number(metadata.confidence);
  }

  if (metadata?.alertLevel) {
    payload.alertLevel = metadata.alertLevel;
  }

  if (typeof metadata?.notifyPolice === 'boolean') {
    payload.notifyPolice = metadata.notifyPolice;
  }

  return payload;
}

async function createTriggeredTimelineEventIdempotent(alertId, actorId, metadata = {}) {
  const eventRef = doc(db, 'alerts', alertId, 'events', 'event_triggered');
  await setDoc(
    eventRef,
    {
      type: 'triggered',
      actorId,
      timestamp: serverTimestamp(),
      metadata,
    },
    { merge: true }
  );
}

async function sendAlertToFirestore({ alertId, userId, location, triggerType, metadata = {} }) {
  const alertRef = doc(db, 'alerts', alertId);
  const existing = await getDoc(alertRef);

  if (existing.exists()) {
    logger.info(TAG, `Alert already exists, reusing idempotent alert: ${alertId}`);
    return { alertId, created: false };
  }

  const alertData = buildAlertPayload(userId, location, triggerType, metadata);
  await setDoc(alertRef, alertData);

  await createTriggeredTimelineEventIdempotent(alertId, userId, {
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: location.accuracy || null,
  });

  return { alertId, created: true };
}

async function triggerSMSBackup(alertItem) {
  const location = alertItem?.location;
  if (!alertItem?.userId || !location?.latitude || !location?.longitude) {
    logger.error(TAG, 'SMS backup skipped due to incomplete alert data', {
      alertId: alertItem?.alertId,
    });
    return;
  }

  const userName = alertItem.userName || null;
  const smsResult = await sendOfflineEmergencySMS(alertItem.userId, location, userName);

  if (smsResult.sent > 0) {
    logger.warn(TAG, 'SMS fallback triggered after max retries', {
      alertId: alertItem.alertId,
      sent: smsResult.sent,
      usedCache: smsResult.usedCache,
    });
    return;
  }

  logger.error(TAG, 'SMS fallback failed after max retries', {
    alertId: alertItem.alertId,
    error: getSMSErrorMessage(smsResult),
  });
}

async function ensureRetryQueueInitialized() {
  if (retryQueueReady) return;

  await initializeAlertRetryQueue({
    onSendAlert: async (item) => {
      await sendAlertToFirestore({
        alertId: item.alertId,
        userId: item.userId,
        location: item.location,
        triggerType: item.triggerType,
        metadata: {
          source: item.source,
          detectedAt: item.detectedAt,
          confidence: item.confidence,
          alertLevel: item.alertLevel,
          notifyPolice: item.notifyPolice,
        },
      });
    },
    onMaxRetriesReached: async (item) => {
      await triggerSMSBackup(item);
    },
  });

  retryQueueReady = true;
}

export async function initializeSOSDeliverySystem() {
  await ensureRetryQueueInitialized();
}

export function shutdownSOSDeliverySystem() {
  retryQueueReady = false;
  shutdownAlertRetryQueue();
}

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

    if (location && location.latitude && location.longitude) {
      return location;
    }

    // Fallback 1: in-memory last-known device location from active session.
    const cachedLocation = getCachedLocation();
    if (cachedLocation?.latitude && cachedLocation?.longitude) {
      logger.info(TAG, 'Using cached in-memory location for SOS dispatch');
      return cachedLocation;
    }

    // Fallback 2: one-shot foreground location read.
    const currentLocation = await getCurrentLocation();
    if (currentLocation?.latitude && currentLocation?.longitude) {
      logger.info(TAG, 'Using freshly sampled location for SOS dispatch');
      return currentLocation;
    }

    throw new Error('User location not available');
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

/**
 * Create a new SOS alert in Firestore
 * @param {string} userId - Firebase user ID
 * @param {number} latitude - User's latitude
 * @param {number} longitude - User's longitude
 * @param {number} accuracy - GPS accuracy (optional)
 * @param {Object} options - Optional values { alertId }
 * @returns {Promise<string>} Alert document ID
 */
export async function createAlert(userId, latitude, longitude, accuracy = null, options = {}) {
  try {
    if (!userId) throw new Error('User ID is required');
    if (latitude === undefined || longitude === undefined) {
      throw new Error('Location coordinates are required');
    }

    const alertId = options.alertId || doc(collection(db, 'alerts')).id;
    const location = { latitude, longitude, accuracy };
    const writeResult = await sendAlertToFirestore({
      alertId,
      userId,
      location,
      triggerType: normalizeTriggerType(options.triggerType),
    });

    if (writeResult.created) {
      logger.info('[alertService]', 'SOS alert created successfully:', alertId);
    }

    // Keep existing timeline helper compatibility for legacy flow when explicitly requested.
    if (options.createLegacyTimelineHook) {
      await createTimelineEvent(alertId, 'triggered', userId, {
        latitude,
        longitude,
        accuracy,
      });
    }

    return alertId;
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
export async function dispatchSOSAlert(userId, location, options = {}) {
  const result = {
    success: false,
    method: null, // 'firestore' | 'retry_queue' | 'sms'
    alertId: null,
    smsResult: null,
    error: null,
    statusMessage: null,
    deliveryStatus: null,
  };

  try {
    if (!userId) {
      throw new Error('User ID is required');
    }

    if (!location || !location.latitude || !location.longitude) {
      throw new Error('Location coordinates are required');
    }

    await ensureRetryQueueInitialized();

    const triggerType = normalizeTriggerType(options.triggerType);
    const metadata = {
      source: options.source || (triggerType === 'AI' ? 'AI_DETECTION' : null),
      detectedAt: Number(options.detectedAt || 0) || null,
      confidence: Number.isFinite(Number(options.confidence)) ? Number(options.confidence) : null,
      alertLevel: options.alertLevel || null,
      notifyPolice: Boolean(options.notifyPolice),
    };

    const alertId = doc(collection(db, 'alerts')).id;
    result.alertId = alertId;

    logger.event('info', TAG, 'SOS_TRIGGERED', {
      alertId,
      userId,
      hasAccuracy: location.accuracy != null,
    });

    // Check connectivity
    const deviceOnline = await isOnline();
    logger.info(TAG, `SOS dispatch initiated - Online: ${deviceOnline}`);

    if (deviceOnline) {
      // ─────────────────────────────────────────────────────────────────────
      // ONLINE PATH: Use Firestore + FCM
      // ─────────────────────────────────────────────────────────────────────
      result.method = 'firestore';

      try {
        await sendAlertToFirestore({ alertId, userId, location, triggerType, metadata });

        result.success = true;
        result.deliveryStatus = 'sent';
        result.statusMessage = 'Emergency alert sent';
        logger.event('info', TAG, 'SOS_DELIVERED_FIRESTORE', {
          alertId,
          userId,
          method: 'firestore',
        });
        logger.info(TAG, `SOS alert created via Firestore: ${alertId}`);

        try {
          await startLocationTracking(userId, { sosAlertId: alertId });
        } catch (trackingError) {
          logger.warn(
            TAG,
            `SOS location tracking start failed: ${trackingError?.message || trackingError}`
          );
        }

        // Proactively cache guardians for future offline scenarios
        try {
          const guardians = await fetchGuardians(userId);
          await cacheGuardiansForOffline(userId, guardians);
        } catch (cacheError) {
          logger.warn(TAG, 'Failed to cache guardians:', cacheError.message);
        }

        return result;
      } catch (firestoreError) {
        logger.warn(TAG, 'Firestore write failed, queueing for retry:', {
          alertId,
          error: firestoreError?.message,
        });
      }
    }

    // Queue failed/offline alert for guaranteed retry delivery.
    let userName = null;
    try {
      const profile = await fetchUserProfile(userId);
      userName = profile?.name || profile?.displayName || null;
    } catch {
      logger.debug(TAG, 'Could not fetch user profile for retry queue metadata');
    }

    try {
      await enqueuePendingAlert({
        alertId,
        userId,
        location,
        triggerType,
        source: metadata.source,
        detectedAt: metadata.detectedAt,
        confidence: metadata.confidence,
        alertLevel: metadata.alertLevel,
        notifyPolice: metadata.notifyPolice,
        timestamp: Date.now(),
        retries: 0,
        status: 'pending_retry',
        userName,
        nextRetryAt: Date.now(),
      });

      // Trigger immediate attempt if connectivity just returned while dispatching.
      await retryPendingAlertsNow('post-enqueue');

      result.success = true;
      result.method = 'retry_queue';
      result.deliveryStatus = 'pending_retry';
      result.statusMessage = 'Network unstable - retrying';

      try {
        await startLocationTracking(userId, { sosAlertId: alertId });
      } catch (trackingError) {
        logger.warn(
          TAG,
          `SOS location tracking start failed: ${trackingError?.message || trackingError}`
        );
      }

      logger.event('warn', TAG, 'SOS_QUEUED_FOR_RETRY', {
        alertId,
        userId,
        retries: 0,
      });

      logger.warn(TAG, 'SOS queued for retry delivery', { alertId, userId });
    } catch (queueError) {
      logger.error(TAG, 'Failed to enqueue SOS retry item, triggering SMS backup immediately', {
        alertId,
        error: queueError?.message,
      });

      const smsResult = await sendOfflineEmergencySMS(userId, location, userName);
      result.smsResult = smsResult;
      result.method = 'sms';
      result.deliveryStatus = 'sms_backup_prepared';
      result.statusMessage = 'Offline backup message prepared';

      logger.event('warn', TAG, 'SOS_SMS_BACKUP_TRIGGERED', {
        alertId,
        userId,
        sent: smsResult.sent || 0,
      });

      if (smsResult.sent > 0) {
        result.success = true;
      } else {
        result.success = false;
        result.error = getSMSErrorMessage(smsResult);
      }
    }

    return result;
  } catch (error) {
    logger.error(TAG, 'dispatchSOSAlert fatal error:', error);
    result.error = error.message;
    result.deliveryStatus = 'failed';
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
