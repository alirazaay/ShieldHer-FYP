import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import {
  subscribeToUserLocation,
  getLocationErrorMessage,
  formatLocationTimestamp,
} from '../services/locationListener';
import { fetchUserProfile } from '../services/profile';
import { calculateDistance } from '../utils/distance';
import { getCurrentLocation } from '../services/location';
import logger from '../utils/logger';

const TAG = '[UserLocationMapScreen]';

function hasValidCoordinates(location) {
  return Number.isFinite(location?.latitude) && Number.isFinite(location?.longitude);
}

const UserLocationMapScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();

  const routeUserId = route?.params?.userId || null;
  const routeAlertId = route?.params?.alertId || null;
  const routeLatitude = Number(route?.params?.latitude);
  const routeLongitude = Number(route?.params?.longitude);

  const [resolvedUserId, setResolvedUserId] = useState(routeUserId);

  // Location and user data state
  const [userLocation, setUserLocation] = useState(null);
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [guardianLocation, setGuardianLocation] = useState(null);
  const [guardianLocLoading, setGuardianLocLoading] = useState(true);

  // Map reference for animations
  const mapRef = useRef(null);
  const locationSubscriptionRef = useRef(null);

  const hasRouteCoordinates = Number.isFinite(routeLatitude) && Number.isFinite(routeLongitude);

  const extractAlertLocation = (alertData = {}) => {
    const lat = Number(alertData?.latitude ?? alertData?.location?.latitude ?? NaN);
    const lng = Number(alertData?.longitude ?? alertData?.location?.longitude ?? NaN);
    const accuracy = Number(alertData?.accuracy ?? alertData?.location?.accuracy ?? NaN);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }

    return {
      latitude: lat,
      longitude: lng,
      accuracy: Number.isFinite(accuracy) ? accuracy : null,
      timestamp: Date.now(),
    };
  };

  const openInGoogleMaps = async () => {
    if (!hasValidCoordinates(userLocation)) {
      setError({ message: 'Location not available yet', type: 'warning' });
      return;
    }

    const url = `https://www.google.com/maps?q=${userLocation.latitude},${userLocation.longitude}`;
    logger.info(TAG, 'Opening external maps URL', {
      alertId: routeAlertId,
      userId: resolvedUserId,
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
    });

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        setError({ message: 'Unable to open maps on this device', type: 'error' });
        return;
      }
      await Linking.openURL(url);
    } catch (openErr) {
      logger.error(TAG, 'Failed opening external map URL:', openErr);
      setError({ message: 'Unable to open maps right now', type: 'error' });
    }
  };

  // Initialize: fetch user profile and subscribe to location updates
  useEffect(() => {
    const initializeScreen = async () => {
      try {
        setLoading(true);
        setError(null);

        logger.info(TAG, 'Map screen navigation payload received', {
          routeUserId,
          routeAlertId,
          hasRouteCoordinates,
          routeLatitude,
          routeLongitude,
        });

        let nextUserId = routeUserId;

        if (!nextUserId && routeAlertId) {
          try {
            const alertSnap = await getDoc(doc(db, 'alerts', routeAlertId));
            if (alertSnap.exists()) {
              const alertData = alertSnap.data() || {};
              const ownerId = alertData.userId || alertData.ownerId || null;
              const alertLocation = extractAlertLocation(alertData);

              if (ownerId) {
                nextUserId = ownerId;
                setResolvedUserId(ownerId);
              }

              if (alertLocation) {
                setUserLocation(alertLocation);
              }

              logger.info(TAG, 'Resolved alert document fallback payload', {
                alertId: routeAlertId,
                hasOwnerId: Boolean(ownerId),
                hasAlertLocation: Boolean(alertLocation),
              });
            }
          } catch (alertFetchErr) {
            logger.warn(TAG, 'Failed to load alert document fallback:', alertFetchErr);
          }
        }

        if (hasRouteCoordinates) {
          setUserLocation({
            latitude: routeLatitude,
            longitude: routeLongitude,
            accuracy: null,
            timestamp: Date.now(),
          });
        }

        if (!nextUserId && !routeAlertId && !hasRouteCoordinates) {
          setError({ message: 'Location not available yet', type: 'warning' });
          setLoading(false);
          return;
        }

        // Fetch user profile to get name
        if (nextUserId) {
          try {
            const profile = await fetchUserProfile(nextUserId);
            setUserName(profile.fullName || 'User');
          } catch (profileErr) {
            logger.warn(TAG, 'Could not fetch user profile for map screen:', profileErr);
            setUserName('User');
          }
        }

        // Fetch local guardian's location for distance calculations
        const gLocation = await getCurrentLocation();
        setGuardianLocation(gLocation);
        setGuardianLocLoading(false);

        // Subscribe to real-time location updates
        if (nextUserId) {
          // Subscribe to real-time location updates
          const unsubscribe = subscribeToUserLocation(
            nextUserId,
            (location) => {
              setUserLocation(location);

              // Animate map camera to follow user
              if (mapRef.current && hasValidCoordinates(location)) {
                mapRef.current.animateCamera(
                  {
                    center: {
                      latitude: location.latitude,
                      longitude: location.longitude,
                    },
                    pitch: 0,
                    heading: 0,
                    altitude: 1000,
                  },
                  { duration: 1000 }
                );
              }
            },
            (err) => {
              logger.error(TAG, 'Location subscription error:', err);
              setError({ message: getLocationErrorMessage(err), type: 'error' });
            }
          );

          locationSubscriptionRef.current = unsubscribe;
        }

        setLoading(false);
      } catch (err) {
        logger.error(TAG, 'Initialization error:', err);
        setError({ message: getLocationErrorMessage(err), type: 'error' });
        setLoading(false);
      }
    };

    initializeScreen();

    // Cleanup: unsubscribe from location updates when screen unmounts
    return () => {
      if (locationSubscriptionRef.current) {
        locationSubscriptionRef.current();
        locationSubscriptionRef.current = null;
        logger.info(TAG, 'Location subscription cleaned up');
      }
    };
  }, [routeAlertId, routeLatitude, routeLongitude, routeUserId, hasRouteCoordinates]);

  // Auto-dismiss error messages after 4 seconds
  useEffect(() => {
    if (error) {
      const timeout = setTimeout(() => setError(null), 4000);
      return () => clearTimeout(timeout);
    }
  }, [error]);

  // Loading state
  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialCommunityIcons name="chevron-left" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>{userName}</Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4F2CF5" />
          <Text style={styles.loadingText}>Loading location...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Available location
  const hasLocation = hasValidCoordinates(userLocation);

  // Calculate distance
  const distance =
    hasLocation && guardianLocation
      ? calculateDistance(
          guardianLocation.latitude,
          guardianLocation.longitude,
          userLocation.latitude,
          userLocation.longitude
        )
      : null;

  return (
    <SafeAreaView style={[styles.safe, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialCommunityIcons name="chevron-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>{userName}</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Error Toast */}
      {error && (
        <View style={[styles.errorToast, styles.errorToastError]}>
          <MaterialCommunityIcons name="alert-circle" size={16} color="#EF4444" />
          <Text style={[styles.errorToastText, { color: '#EF4444' }]}>{error.message}</Text>
        </View>
      )}

      {/* Map View */}
      {hasLocation ? (
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={{
            latitude: userLocation.latitude,
            longitude: userLocation.longitude,
            latitudeDelta: 0.0922,
            longitudeDelta: 0.0421,
          }}
          showsUserLocation={true}
          followsUserLocation={false}
        >
          {/* User Location Marker */}
          <Marker
            coordinate={{
              latitude: userLocation.latitude,
              longitude: userLocation.longitude,
            }}
            title={userName}
            description={`Updated: ${formatLocationTimestamp(userLocation.timestamp)}`}
            pinColor="#4F2CF5"
          />
        </MapView>
      ) : (
        <View style={styles.noLocationContainer}>
          <MaterialCommunityIcons name="map-search" size={64} color="#9AA0A6" />
          <Text style={styles.noLocationTitle}>Location Not Available</Text>
          <Text style={styles.noLocationSubtitle}>
            Location not available yet. The sender may still be granting location permission.
          </Text>
        </View>
      )}

      {/* Location Info Footer */}
      {hasLocation && (
        <View style={styles.footer}>
          <View style={styles.infoRow}>
            <MaterialCommunityIcons name="map-marker-distance" size={16} color="#4F2CF5" />
            <Text style={styles.infoLabel}>Distance:</Text>
            {guardianLocLoading ? (
              <Text style={styles.infoValue}>Calculating...</Text>
            ) : distance !== null ? (
              <Text style={[styles.infoValue, { fontWeight: 'bold' }]}>{distance} km from you</Text>
            ) : (
              <Text style={[styles.infoValue, { color: '#EF4444' }]}>Distance unavailable</Text>
            )}
          </View>
          <View style={styles.infoRow}>
            <MaterialCommunityIcons name="map-marker" size={16} color="#4F2CF5" />
            <Text style={styles.infoLabel}>Coordinates:</Text>
            <Text style={styles.infoValue}>
              {userLocation.latitude.toFixed(4)}, {userLocation.longitude.toFixed(4)}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <MaterialCommunityIcons name="clock-outline" size={16} color="#4F2CF5" />
            <Text style={styles.infoLabel}>Last Update:</Text>
            <Text style={styles.infoValue}>{formatLocationTimestamp(userLocation.timestamp)}</Text>
          </View>
          {userLocation.accuracy && (
            <View style={styles.infoRow}>
              <MaterialCommunityIcons name="signal-distance-variant" size={16} color="#4F2CF5" />
              <Text style={styles.infoLabel}>Accuracy:</Text>
              <Text style={styles.infoValue}>{userLocation.accuracy.toFixed(1)}m</Text>
            </View>
          )}

          <TouchableOpacity style={styles.openMapsButton} onPress={openInGoogleMaps}>
            <MaterialCommunityIcons name="google-maps" size={16} color="#fff" />
            <Text style={styles.openMapsButtonText}>Open in Google Maps</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#E9EAEE',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#4F2CF5',
    paddingHorizontal: 16,
    paddingVertical: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  placeholder: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#4B5057',
  },
  map: {
    flex: 1,
  },
  noLocationContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  noLocationTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111318',
    marginTop: 16,
    marginBottom: 4,
  },
  noLocationSubtitle: {
    fontSize: 13,
    color: '#4B5057',
    textAlign: 'center',
  },
  errorToast: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 12,
    marginVertical: 8,
    borderRadius: 8,
    gap: 8,
  },
  errorToastError: {
    backgroundColor: '#FEE2E2',
    borderLeftWidth: 3,
    borderLeftColor: '#EF4444',
  },
  errorToastText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
  },
  footer: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E2',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 6,
    gap: 8,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3D3F44',
    minWidth: 80,
  },
  infoValue: {
    fontSize: 12,
    color: '#111318',
    flex: 1,
  },
  openMapsButton: {
    marginTop: 10,
    backgroundColor: '#4F2CF5',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  openMapsButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
});

export default UserLocationMapScreen;
