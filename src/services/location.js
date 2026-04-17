import * as Location from 'expo-location';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import logger from '../utils/logger';

let lastKnownLocation = null;

async function areLocationServicesEnabled() {
  if (typeof Location.hasServicesEnabledAsync === 'function') {
    return Location.hasServicesEnabledAsync();
  }

  if (typeof Location.hasServicesEnabled === 'function') {
    return Location.hasServicesEnabled();
  }

  // If API shape changes, avoid hard-failing permission flows.
  return true;
}

function cacheLocation(coords) {
  if (!coords) return;
  if (coords.latitude == null || coords.longitude == null) return;

  lastKnownLocation = {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: coords.accuracy || null,
    timestamp: Date.now(),
  };
}

export function getCachedLocation() {
  return lastKnownLocation;
}

/**
 * Request foreground location permission from the user
 * @returns {Promise<Object>} { granted: boolean, status: string }
 */
export async function requestLocationPermission() {
  logger.info('[location]', 'requestLocationPermission start');

  try {
    // Check if location services are enabled on the device
    const servicesEnabled = await areLocationServicesEnabled();
    if (!servicesEnabled) {
      logger.warn('[location]', 'Location services disabled on device');
      return {
        granted: false,
        status: 'disabled',
        message: 'Location services are disabled. Please enable GPS in your device settings.',
      };
    }

    // Reuse existing permission state to avoid repeatedly prompting users.
    const existing =
      typeof Location.getForegroundPermissionsAsync === 'function'
        ? await Location.getForegroundPermissionsAsync()
        : null;
    if (existing?.status === 'granted') {
      logger.info('[location]', 'Location permission already granted');
      return {
        granted: true,
        status: 'granted',
      };
    }

    // Request foreground location permission only when needed.
    const { status } = await Location.requestForegroundPermissionsAsync();

    if (status === 'granted') {
      logger.info('[location]', 'Location permission granted');
      return {
        granted: true,
        status: 'granted',
      };
    } else if (status === 'denied') {
      logger.warn('[location]', 'Location permission denied');
      return {
        granted: false,
        status: 'denied',
        message:
          'Location permission is required for safety features. Please enable it in Settings.',
      };
    } else {
      logger.warn('[location]', 'Location permission undetermined');
      return {
        granted: false,
        status: 'undetermined',
        message: 'Unable to determine location permission status.',
      };
    }
  } catch (error) {
    logger.error('[location]', 'requestLocationPermission error:', error);
    return {
      granted: false,
      status: 'error',
      message: 'Failed to request location permission.',
    };
  }
}

/**
 * Request background location permission ("Allow all the time").
 * Must be called AFTER foreground permission is already granted.
 * Required for location tracking when the app is backgrounded during
 * an active SOS — the victim's phone will likely be in their pocket.
 * @returns {Promise<Object>} { granted: boolean, status: string }
 */
export async function requestBackgroundLocationPermission() {
  logger.info('[location]', 'requestBackgroundLocationPermission start');

  try {
    // Foreground permission must be granted first (Android requirement)
    const foreground = await requestLocationPermission();
    if (!foreground.granted) {
      return foreground;
    }

    // Check if background permission is already granted
    const existing =
      typeof Location.getBackgroundPermissionsAsync === 'function'
        ? await Location.getBackgroundPermissionsAsync()
        : null;
    if (existing?.status === 'granted') {
      logger.info('[location]', 'Background location permission already granted');
      return { granted: true, status: 'granted' };
    }

    // Request background permission
    const { status } = await Location.requestBackgroundPermissionsAsync();

    if (status === 'granted') {
      logger.info('[location]', 'Background location permission granted');
      return { granted: true, status: 'granted' };
    }

    logger.warn('[location]', 'Background location permission denied:', status);
    return {
      granted: false,
      status,
      message:
        'Background location is required for SOS tracking when the app is in the background. ' +
        'Please select "Allow all the time" in Settings.',
    };
  } catch (error) {
    logger.error('[location]', 'requestBackgroundLocationPermission error:', error);
    return {
      granted: false,
      status: 'error',
      message: 'Failed to request background location permission.',
    };
  }
}

/**
 * Request both foreground and background location permissions.
 * Call this when Safety Mode is activated to ensure full location tracking.
 * @returns {Promise<Object>} { foregroundGranted, backgroundGranted, message }
 */
export async function requestFullLocationPermissions() {
  const foreground = await requestLocationPermission();
  if (!foreground.granted) {
    return {
      foregroundGranted: false,
      backgroundGranted: false,
      message: foreground.message,
    };
  }

  const background = await requestBackgroundLocationPermission();
  return {
    foregroundGranted: true,
    backgroundGranted: background.granted,
    message: background.granted ? null : background.message,
  };
}

/**
 * Start tracking user location and updating Firestore
 * @param {string} userId - Firebase user ID
 * @returns {Promise<Function>} Unsubscribe function to stop tracking
 * @throws {Error} If userId is invalid or location tracking fails
 */
export async function startLocationTracking(userId) {
  logger.info('[location]', 'startLocationTracking start', { userId });

  if (!userId) {
    const error = new Error('User ID is required to start location tracking');
    error.code = 'validation/missing-userId';
    throw error;
  }

  try {
    // Check if location services are enabled
    const servicesEnabled = await areLocationServicesEnabled();
    if (!servicesEnabled) {
      const error = new Error('Location services are disabled on this device');
      error.code = 'location/services-disabled';
      throw error;
    }

    // Check/request permissions
    const currentPermission =
      typeof Location.getForegroundPermissionsAsync === 'function'
        ? await Location.getForegroundPermissionsAsync()
        : null;
    const status = currentPermission?.status;
    if (status !== 'granted') {
      const permissionResult = await requestLocationPermission();
      if (!permissionResult.granted) {
        const error = new Error(permissionResult.message || 'Location permission not granted');
        error.code = 'location/permission-denied';
        throw error;
      }
    }

    // Start watching position
    // Update every 10 seconds with high accuracy
    const subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 10000, // 10 seconds
        distanceInterval: 0, // Update on every interval regardless of distance
      },
      async (location) => {
        try {
          const { latitude, longitude, accuracy } = location.coords;

          cacheLocation(location.coords);

          logger.info('[location]', 'Position update', {
            latitude: latitude.toFixed(4),
            longitude: longitude.toFixed(4),
            accuracy: accuracy?.toFixed(1),
          });

          // Update Firestore with latest location
          const userLocationRef = doc(db, 'users', userId);
          await updateDoc(userLocationRef, {
            location: {
              latitude,
              longitude,
              accuracy: accuracy || null,
              timestamp: serverTimestamp(),
            },
          });
        } catch (updateError) {
          logger.error('[location]', 'Error updating Firestore:', updateError);
          // Don't throw - let location watching continue even if Firestore update fails
          // In production, could implement retry queue or offline caching
        }
      }
    );

    logger.info('[location]', 'Location tracking started successfully');
    return subscription;
  } catch (error) {
    logger.error('[location]', 'startLocationTracking error:', error);
    throw error;
  }
}

/**
 * Stop tracking user location
 * @param {Object} subscription - Location subscription object returned from startLocationTracking
 * @returns {Promise<void>}
 */
export async function stopLocationTracking(subscription) {
  logger.info('[location]', 'stopLocationTracking start');

  try {
    if (subscription) {
      subscription.remove();
      logger.info('[location]', 'Location tracking stopped');
    }
  } catch (error) {
    logger.error('[location]', 'stopLocationTracking error:', error);
    // Don't throw - just log the error during cleanup
  }
}

/**
 * Map location error codes to user-friendly messages
 * @param {Error} error - Error object
 * @returns {string} User-friendly error message
 */
export function getLocationErrorMessage(error) {
  const errorCodeMap = {
    'location/services-disabled':
      'Location services are disabled on this device. Please enable GPS in Settings.',
    'location/permission-denied':
      'Location permission is required for safety features. Please enable it in Settings.',
    'location/timeout': 'Unable to get your location. Please try again.',
    'permission-denied': 'Location permission required. Please enable in Settings.',
    'network-request-failed': 'Network connection failed while updating your location.',
    unavailable: 'Location service unavailable. Please try again later.',
    'validation/missing-userId': 'Invalid user ID. Please try logging in again.',
  };

  const code = error.code || error.message;
  return errorCodeMap[code] || error.message || 'Unable to access location. Please try again.';
}

/**
 * Check if location permissions are granted (without requesting)
 * @returns {Promise<boolean>} True if permissions are granted
 */
export async function checkLocationPermission() {
  try {
    if (typeof Location.getForegroundPermissionsAsync !== 'function') {
      return false;
    }
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    logger.error('[location]', 'checkLocationPermission error:', error);
    return false;
  }
}

/**
 * Fetch the current foreground location of the device once
 * @returns {Promise<{latitude: number, longitude: number, accuracy: number} | null>}
 */
export async function getCurrentLocation() {
  logger.info('[location]', 'getCurrentLocation start');
  try {
    const servicesEnabled = await areLocationServicesEnabled();
    if (!servicesEnabled) {
      logger.warn('[location]', 'Cannot fetch current location: services disabled');
      return null;
    }

    const currentPermission =
      typeof Location.getForegroundPermissionsAsync === 'function'
        ? await Location.getForegroundPermissionsAsync()
        : null;
    let status = currentPermission?.status;

    if (status !== 'granted') {
      const permissionResult = await requestLocationPermission();
      status = permissionResult.status;
    }

    if (status !== 'granted') {
      logger.warn('[location]', 'Cannot fetch current location without permissions');
      return null;
    }

    const { coords } = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    cacheLocation(coords);

    return {
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy,
    };
  } catch (error) {
    logger.error('[location]', 'getCurrentLocation error:', error);
    return null;
  }
}
