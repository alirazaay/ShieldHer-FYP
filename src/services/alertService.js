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

/**
 * Fetch user's current location from Firestore
 * @param {string} userId - Firebase user ID
 * @returns {Promise<Object>} Location object {latitude, longitude, ...}
 */
export async function fetchUserLocation(userId) {
  try {
    if (!userId) throw new Error('User ID is required');

    const locationDocRef = doc(db, 'users', userId, 'location', 'current');
    const locationSnap = await getDoc(locationDocRef);

    if (!locationSnap.exists()) {
      throw new Error('User location not available');
    }

    return locationSnap.data();
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

      if (timeSinceAlert < 30000) { // 30 seconds in milliseconds
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
    'unavailable': 'Service unavailable. Please try again later.',
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
