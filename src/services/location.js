import * as Location from 'expo-location';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

/**
 * Request foreground location permission from the user
 * @returns {Promise<Object>} { granted: boolean, status: string }
 */
export async function requestLocationPermission() {
  console.log('[location] requestLocationPermission start');

  try {
    // Check if location services are enabled on the device
    const servicesEnabled = await Location.hasServicesEnabled();
    if (!servicesEnabled) {
      console.warn('[location] Location services disabled on device');
      return {
        granted: false,
        status: 'disabled',
        message: 'Location services are disabled. Please enable GPS in your device settings.',
      };
    }

    // Request foreground location permission
    const { status } = await Location.requestForegroundPermissionsAsync();

    if (status === 'granted') {
      console.log('[location] Location permission granted');
      return {
        granted: true,
        status: 'granted',
      };
    } else if (status === 'denied') {
      console.warn('[location] Location permission denied');
      return {
        granted: false,
        status: 'denied',
        message: 'Location permission is required for safety features. Please enable it in Settings.',
      };
    } else {
      console.warn('[location] Location permission undetermined');
      return {
        granted: false,
        status: 'undetermined',
        message: 'Unable to determine location permission status.',
      };
    }
  } catch (error) {
    console.error('[location] requestLocationPermission error:', error);
    return {
      granted: false,
      status: 'error',
      message: 'Failed to request location permission.',
    };
  }
}

/**
 * Start tracking user location and updating Firestore
 * @param {string} userId - Firebase user ID
 * @returns {Promise<Function>} Unsubscribe function to stop tracking
 * @throws {Error} If userId is invalid or location tracking fails
 */
export async function startLocationTracking(userId) {
  console.log('[location] startLocationTracking start', { userId });

  if (!userId) {
    const error = new Error('User ID is required to start location tracking');
    error.code = 'validation/missing-userId';
    throw error;
  }

  try {
    // Check if location services are enabled
    const servicesEnabled = await Location.hasServicesEnabled();
    if (!servicesEnabled) {
      const error = new Error('Location services are disabled on this device');
      error.code = 'location/services-disabled';
      throw error;
    }

    // Check/request permissions
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      const permissionResult = await requestLocationPermission();
      if (!permissionResult.granted) {
        const error = new Error(
          permissionResult.message || 'Location permission not granted'
        );
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

          console.log('[location] Position update', {
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
          console.error('[location] Error updating Firestore:', updateError);
          // Don't throw - let location watching continue even if Firestore update fails
          // In production, could implement retry queue or offline caching
        }
      }
    );

    console.log('[location] Location tracking started successfully');
    return subscription;
  } catch (error) {
    console.error('[location] startLocationTracking error:', error);
    throw error;
  }
}

/**
 * Stop tracking user location
 * @param {Object} subscription - Location subscription object returned from startLocationTracking
 * @returns {Promise<void>}
 */
export async function stopLocationTracking(subscription) {
  console.log('[location] stopLocationTracking start');

  try {
    if (subscription) {
      subscription.remove();
      console.log('[location] Location tracking stopped');
    }
  } catch (error) {
    console.error('[location] stopLocationTracking error:', error);
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
    'location/services-disabled': 'Location services are disabled on this device. Please enable GPS in Settings.',
    'location/permission-denied': 'Location permission is required for safety features. Please enable it in Settings.',
    'location/timeout': 'Unable to get your location. Please try again.',
    'permission-denied': 'Location permission required. Please enable in Settings.',
    'network-request-failed': 'Network connection failed while updating your location.',
    'unavailable': 'Location service unavailable. Please try again later.',
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
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('[location] checkLocationPermission error:', error);
    return false;
  }
}

/**
 * Fetch the current foreground location of the device once
 * @returns {Promise<{latitude: number, longitude: number, accuracy: number} | null>}
 */
export async function getCurrentLocation() {
  console.log('[location] getCurrentLocation start');
  try {
    const permissionResult = await requestLocationPermission();
    if (!permissionResult.granted) {
      console.warn('[location] Cannot fetch current location without permissions');
      return null;
    }

    const { coords } = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    
    return {
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy,
    };
  } catch (error) {
    console.error('[location] getCurrentLocation error:', error);
    return null;
  }
}
