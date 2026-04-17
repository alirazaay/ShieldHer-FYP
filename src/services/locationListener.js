import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import * as Location from 'expo-location';
import { requestLocationPermission } from './location';
import logger from '../utils/logger';

let activeTrackingSub = null;
let activeTrackingUserId = null;
let activeSosAlertId = null;
let activeSosAlertUnsubscribe = null;
let sosTrackingStartedSession = false;
let missingSosAlertWriteLogged = false;

function clearSosLifecycleBinding() {
  if (activeSosAlertUnsubscribe) {
    activeSosAlertUnsubscribe();
    activeSosAlertUnsubscribe = null;
  }

  activeSosAlertId = null;
  sosTrackingStartedSession = false;
  missingSosAlertWriteLogged = false;
}

function isAlertDocMissingError(error) {
  const code = error?.code || '';
  const message = String(error?.message || '');
  return code === 'not-found' || message.includes('No document to update');
}

function bindSosAlertLifecycle(userId, alertId) {
  if (!alertId) return;

  clearSosLifecycleBinding();
  activeSosAlertId = alertId;

  const alertRef = doc(db, 'alerts', alertId);
  activeSosAlertUnsubscribe = onSnapshot(
    alertRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        logger.info('[locationListener]', 'SOS lifecycle watcher waiting for alert document', {
          userId,
          alertId,
        });
        return;
      }

      const status = snapshot.data()?.status || 'active';
      if (status !== 'active') {
        logger.info('[locationListener]', 'SOS alert no longer active', {
          userId,
          alertId,
          status,
        });

        if (sosTrackingStartedSession) {
          stopLocationTracking(`sos-ended:${status}`);
        } else {
          clearSosLifecycleBinding();
        }
      }
    },
    (error) => {
      logger.error('[locationListener]', 'SOS lifecycle watcher error:', error);
    }
  );
}

function toFiniteNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeLocationPayload(userData) {
  if (!userData || typeof userData !== 'object') return null;

  const rawLocation =
    userData.location ||
    userData.currentLocation ||
    userData.coords ||
    (userData.latitude != null || userData.longitude != null
      ? {
          latitude: userData.latitude,
          longitude: userData.longitude,
          accuracy: userData.accuracy,
          timestamp: userData.locationUpdatedAt || userData.timestamp,
        }
      : null);

  if (!rawLocation || typeof rawLocation !== 'object') return null;

  const latitude = toFiniteNumber(rawLocation.latitude ?? rawLocation.lat);
  const longitude = toFiniteNumber(rawLocation.longitude ?? rawLocation.lng ?? rawLocation.lon);

  if (latitude == null || longitude == null) return null;

  return {
    latitude,
    longitude,
    accuracy: toFiniteNumber(rawLocation.accuracy),
    timestamp:
      rawLocation.timestamp ||
      rawLocation.updatedAt ||
      userData.locationUpdatedAt ||
      userData.timestamp ||
      null,
  };
}

/**
 * Subscribe to real-time location updates for a single user
 * @param {string} userId - Firebase user ID to track
 * @param {function} onLocationUpdate - Callback when location updates: (location) => {}
 * @param {function} onError - Callback for errors: (error) => {}
 * @returns {function} Unsubscribe function
 */
export function subscribeToUserLocation(userId, onLocationUpdate, onError) {
  logger.info('[locationListener]', 'subscribeToUserLocation start', { userId });

  if (!userId) {
    const error = new Error('User ID is required');
    error.code = 'validation/missing-userId';
    onError(error);
    return () => {};
  }

  try {
    const userDocRef = doc(db, 'users', userId);

    const unsubscribe = onSnapshot(
      userDocRef,
      (snapshot) => {
        try {
          if (!snapshot.exists()) {
            logger.warn('[locationListener]', 'User document does not exist', { userId });
            return;
          }

          const userData = snapshot.data();
          const location = normalizeLocationPayload(userData);

          if (location) {
            logger.info('[locationListener]', 'Location update received', {
              userId,
              hasAccuracy: location.accuracy != null,
              hasTimestamp: !!location.timestamp,
            });
            onLocationUpdate(location);
          } else {
            const hasAnyLocationPayload =
              !!userData?.location ||
              !!userData?.currentLocation ||
              !!userData?.coords ||
              userData?.latitude != null ||
              userData?.longitude != null;

            if (hasAnyLocationPayload) {
              logger.warn('[locationListener]', 'Location data missing or invalid', { userId });
            } else {
              logger.info('[locationListener]', 'No location payload yet for user', { userId });
            }
          }
        } catch (err) {
          logger.error('[locationListener]', 'Error processing location snapshot:', err);
          onError(err);
        }
      },
      (error) => {
        logger.error('[locationListener]', 'Firestore listener error:', error);
        onError(error);
      }
    );

    return unsubscribe;
  } catch (error) {
    logger.error('[locationListener]', 'subscribeToUserLocation error:', error);
    onError(error);
    return () => {};
  }
}

/**
 * Subscribe to multiple users' locations simultaneously
 * @param {Array<string>} userIds - Array of user IDs to track
 * @param {function} onUpdates - Callback when any location updates: (userId, location) => {}
 * @param {function} onError - Callback for errors: (error) => {}
 * @returns {function} Function to unsubscribe all listeners
 */
export function subscribeToMultipleLocations(userIds, onUpdates, onError) {
  logger.info('[locationListener]', 'subscribeToMultipleLocations start', {
    count: userIds.length,
  });

  if (!Array.isArray(userIds) || userIds.length === 0) {
    const error = new Error('User IDs array is required and must not be empty');
    error.code = 'validation/invalid-userIds';
    onError(error);
    return () => {};
  }

  const unsubscribers = [];

  try {
    userIds.forEach((userId) => {
      const unsubscribe = subscribeToUserLocation(
        userId,
        (location) => {
          onUpdates(userId, location);
        },
        (error) => {
          logger.error('[locationListener]', 'Error for user', { userId, error });
          onError(error);
        }
      );

      unsubscribers.push(unsubscribe);
    });

    logger.info('[locationListener]', 'Subscribed to', { userCount: userIds.length });

    // Return cleanup function that unsubscribes all listeners
    return () => {
      logger.info('[locationListener]', 'Unsubscribing from all locations');
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  } catch (error) {
    logger.error('[locationListener]', 'subscribeToMultipleLocations error:', error);
    // Cleanup partial subscriptions
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    onError(error);
    return () => {};
  }
}

/**
 * Map location error codes to user-friendly messages
 * @param {Error} error - Error object
 * @returns {string} User-friendly error message
 */
export function getLocationErrorMessage(error) {
  const errorCodeMap = {
    'location/services-disabled': 'Location services are disabled on this device.',
    'location/permission-denied': 'Location permission is required.',
    'location/timeout': 'Unable to get location. Please try again.',
    'permission-denied': 'You do not have permission to access this data.',
    'not-found': 'User location data not found.',
    'network-request-failed': 'Network connection failed. Please try again.',
    unavailable: 'Service unavailable. Please try again later.',
    'validation/missing-userId': 'Invalid user ID.',
    'validation/invalid-userIds': 'Invalid user IDs array.',
  };

  const code = error?.code || error?.message;
  return errorCodeMap[code] || error?.message || 'Unable to load location. Please try again.';
}

/**
 * Format a Firestore timestamp for display
 * @param {number|object} timestamp - Firestore timestamp
 * @returns {string} Formatted time string (e.g., "2 min ago")
 */
export function formatLocationTimestamp(timestamp) {
  if (!timestamp) return 'Unknown';

  let date;
  if (typeof timestamp === 'number') {
    date = new Date(timestamp);
  } else if (timestamp.toDate) {
    date = timestamp.toDate();
  } else {
    return 'Unknown';
  }

  const now = new Date();
  const diffSeconds = Math.floor((now - date) / 1000);

  if (diffSeconds < 60) {
    return 'Just now';
  } else if (diffSeconds < 3600) {
    const minutes = Math.floor(diffSeconds / 60);
    return `${minutes} min ago`;
  } else if (diffSeconds < 86400) {
    const hours = Math.floor(diffSeconds / 3600);
    return `${hours}h ago`;
  } else {
    const days = Math.floor(diffSeconds / 86400);
    return `${days}d ago`;
  }
}

/**
 * Calculate map bounds to fit all locations
 * @param {Array<object>} locations - Array of {latitude, longitude} objects
 * @returns {object} Bounds object {northeast: {lat, lng}, southwest: {lat, lng}}
 */
export function calculateMapBounds(locations) {
  if (!locations || locations.length === 0) {
    return null;
  }

  let minLat = locations[0].latitude;
  let maxLat = locations[0].latitude;
  let minLng = locations[0].longitude;
  let maxLng = locations[0].longitude;

  locations.forEach(({ latitude, longitude }) => {
    minLat = Math.min(minLat, latitude);
    maxLat = Math.max(maxLat, latitude);
    minLng = Math.min(minLng, longitude);
    maxLng = Math.max(maxLng, longitude);
  });

  return {
    northeast: { latitude: maxLat, longitude: maxLng },
    southwest: { latitude: minLat, longitude: minLng },
  };
}

/**
 * Get marker colors for distinct visual identification
 * @param {number} index - Marker index
 * @returns {string} Color hex code
 */
export function getMarkerColor(index) {
  const colors = [
    '#EF4444', // Red
    '#3B82F6', // Blue
    '#10B981', // Green
    '#F59E0B', // Amber
    '#8B5CF6', // Purple
    '#EC4899', // Pink
    '#14B8A6', // Teal
    '#F97316', // Orange
  ];

  return colors[index % colors.length];
}

/**
 * Start tracking user location persistently (Singleton pattern)
 * and update Firestore every 10 seconds.
 * @param {string} userId - Firebase user ID
 * @returns {Promise<void>}
 */
export async function startLocationTracking(userId, options = {}) {
  const sosAlertId = options.sosAlertId || null;

  logger.info('[locationListener]', 'startLocationTracking start', { userId });
  if (!userId) {
    throw new Error('User ID is required to start location tracking');
  }

  // Prevent multiple listeners
  if (activeTrackingSub) {
    if (sosAlertId && activeTrackingUserId === userId && activeSosAlertId !== sosAlertId) {
      sosTrackingStartedSession = false;
      bindSosAlertLifecycle(userId, sosAlertId);
      logger.info('[locationListener]', 'Location tracking promoted to SOS lifecycle mode', {
        userId,
        sosAlertId,
      });
    } else {
      logger.info('[locationListener]', 'Location tracking is already active');
    }
    return;
  }

  try {
    const permissionResult = await requestLocationPermission();
    if (!permissionResult.granted) {
      const error = new Error('Location permission denied');
      error.code = 'location/permission-denied';
      throw error;
    }

    activeTrackingSub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 10000, // 10 seconds
        distanceInterval: 0,
      },
      async (location) => {
        try {
          const { latitude, longitude, accuracy } = location.coords;
          const userLocationRef = doc(db, 'users', userId);
          await updateDoc(userLocationRef, {
            location: {
              latitude,
              longitude,
              accuracy: accuracy || null,
              timestamp: serverTimestamp(),
            },
          });

          if (activeSosAlertId) {
            const alertRef = doc(db, 'alerts', activeSosAlertId);
            try {
              await updateDoc(alertRef, {
                latitude,
                longitude,
                accuracy: accuracy || null,
                lastLocationAt: serverTimestamp(),
              });
              missingSosAlertWriteLogged = false;
            } catch (alertWriteError) {
              if (isAlertDocMissingError(alertWriteError)) {
                if (!missingSosAlertWriteLogged) {
                  missingSosAlertWriteLogged = true;
                  logger.info(
                    '[locationListener]',
                    'SOS alert doc not available yet for live location',
                    {
                      alertId: activeSosAlertId,
                    }
                  );
                }
              } else {
                logger.error(
                  '[locationListener]',
                  'Error updating SOS alert location:',
                  alertWriteError
                );
              }
            }
          }
        } catch (err) {
          logger.error('[locationListener]', 'Error pushing coords to Firestore:', err);
        }
      }
    );

    activeTrackingUserId = userId;

    if (sosAlertId) {
      sosTrackingStartedSession = true;
      bindSosAlertLifecycle(userId, sosAlertId);
    }

    logger.info('[locationListener]', 'Location tracking fully engaged');
  } catch (error) {
    logger.error('[locationListener]', 'startLocationTracking error:', error);
    throw error;
  }
}

/**
 * Stop the singleton location tracking loop
 * @returns {void}
 */
export function stopLocationTracking(reason = 'manual') {
  logger.info('[locationListener]', 'stopLocationTracking invoked', { reason });
  if (activeTrackingSub) {
    activeTrackingSub.remove();
    activeTrackingSub = null;
    logger.info('[locationListener]', 'Location tracking ceased');
  }

  activeTrackingUserId = null;
  clearSosLifecycleBinding();
}
