import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text, StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  useSafeAreaInsets,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { auth } from '../config/firebase';
import { getConnectedUsers } from '../services/profile';
import {
  subscribeToMultipleLocations,
  getLocationErrorMessage,
  calculateMapBounds,
  formatLocationTimestamp,
} from '../services/locationListener';

const GroupLocationMapScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();

  // Connected users and locations state
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [userLocations, setUserLocations] = useState({}); // { userId: location }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Map reference for animations
  const mapRef = useRef(null);
  const [locationSubscription, setLocationSubscription] = useState(null);

  // Initialize: fetch connected users and subscribe to their locations
  useEffect(() => {
    const initializeScreen = async () => {
      try {
        setLoading(true);
        setError(null);

        const currentUser = auth.currentUser;
        if (!currentUser) {
          navigation?.replace('Login');
          return;
        }

        // Fetch connected users
        const users = await getConnectedUsers(currentUser.uid);
        setConnectedUsers(users);

        if (users.length === 0) {
          setLoading(false);
          return;
        }

        // Extract user IDs and subscribe to their locations
        const userIds = users.map((user) => user.id);

        const unsubscribe = subscribeToMultipleLocations(
          userIds,
          (userId, location) => {
            setUserLocations((prev) => ({
              ...prev,
              [userId]: location,
            }));
          },
          (err) => {
            console.error('[GroupLocationMapScreen] Location subscription error:', err);
            setError({ message: getLocationErrorMessage(err), type: 'error' });
          }
        );

        setLocationSubscription(() => unsubscribe);
        setLoading(false);
      } catch (err) {
        console.error('[GroupLocationMapScreen] Initialization error:', err);
        setError({ message: getLocationErrorMessage(err), type: 'error' });
        setLoading(false);
      }
    };

    initializeScreen();

    // Cleanup: unsubscribe from location updates when screen unmounts
    return () => {
      if (locationSubscription) {
        locationSubscription();
        console.log('[GroupLocationMapScreen] Location subscriptions cleaned up');
      }
    };
  }, [navigation]);

  // Auto-dismiss error messages after 4 seconds
  useEffect(() => {
    if (error) {
      const timeout = setTimeout(() => setError(null), 4000);
      return () => clearTimeout(timeout);
    }
  }, [error]);

  // Handle center on all users
  const handleFitAllMarkers = () => {
    const locationsArray = Object.values(userLocations).filter(
      (loc) => loc?.latitude && loc?.longitude
    );

    if (locationsArray.length === 0) return;

    const bounds = calculateMapBounds(locationsArray);
    if (bounds && mapRef.current) {
      mapRef.current.fitToCoordinates(
        [
          { latitude: bounds.northeast.latitude, longitude: bounds.northeast.longitude },
          { latitude: bounds.southwest.latitude, longitude: bounds.southwest.longitude },
        ],
        {
          edgePadding: { top: 100, right: 50, bottom: 100, left: 50 },
          animated: true,
        }
      );
    }
  };

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
          <Text style={styles.title}>Connected Users</Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4F2CF5" />
          <Text style={styles.loadingText}>Loading users and locations...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // No connected users
  if (connectedUsers.length === 0) {
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
          <Text style={styles.title}>Connected Users</Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="account-multiple-outline" size={64} color="#9AA0A6" />
          <Text style={styles.emptyTitle}>No Connected Users</Text>
          <Text style={styles.emptySubtitle}>
            You haven't connected with any users yet. Accept user invites to see their locations.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Calculate number of users with available locations
  const usersWithLocation = Object.keys(userLocations).length;
  const hasAnyLocations = usersWithLocation > 0;

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
        <View style={styles.headerTitleContainer}>
          <Text style={styles.title}>Connected Users</Text>
          <Text style={styles.subtitle}>
            {usersWithLocation} of {connectedUsers.length} tracking
          </Text>
        </View>
        <View style={styles.placeholder} />
      </View>

      {/* Error Toast */}
      {error && (
        <View style={[styles.errorToast, styles.errorToastError]}>
          <MaterialCommunityIcons name="alert-circle" size={16} color="#EF4444" />
          <Text style={[styles.errorToastText, { color: '#EF4444' }]}>
            {error.message}
          </Text>
        </View>
      )}

      {/* Map View */}
      {hasAnyLocations ? (
        <>
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={{
              latitude: 24.8607,
              longitude: 67.0011,
              latitudeDelta: 0.0922,
              longitudeDelta: 0.0421,
            }}
            showsUserLocation={true}
            followsUserLocation={false}
          >
            {/* User Location Markers */}
            {connectedUsers.map((user, index) => {
              const location = userLocations[user.id];
              if (!location?.latitude || !location?.longitude) return null;

              return (
                <Marker
                  key={user.id}
                  coordinate={{
                    latitude: location.latitude,
                    longitude: location.longitude,
                  }}
                  title={user.name}
                  description={`Updated: ${formatLocationTimestamp(location.timestamp)}`}
                  pinColor={['#EF4444', '#3B82F6', '#10B981', '#F59E0B'][index % 4]}
                />
              );
            })}
          </MapView>

          {/* Center Button */}
          <TouchableOpacity
            style={styles.centerButton}
            onPress={handleFitAllMarkers}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="compass" size={24} color="#4F2CF5" />
          </TouchableOpacity>

          {/* Users List at Bottom */}
          <View style={styles.usersListContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.usersList}>
              {connectedUsers.map((user) => {
                const location = userLocations[user.id];
                const hasLocation = location?.latitude && location?.longitude;

                return (
                  <TouchableOpacity
                    key={user.id}
                    onPress={() => navigation.push('UserLocationMap', { userId: user.id })}
                    style={[
                      styles.userBadge,
                      !hasLocation && styles.userBadgeInactive,
                    ]}
                    activeOpacity={0.8}
                  >
                    <View
                      style={[
                        styles.userBadgeAvatar,
                        !hasLocation && styles.userBadgeAvatarInactive,
                      ]}
                    >
                      <Text style={styles.userBadgeAvatarText}>
                        {user.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .toUpperCase()
                          .slice(0, 2)}
                      </Text>
                    </View>
                    <Text style={styles.userBadgeName} numberOfLines={1}>
                      {user.name.split(' ')[0]}
                    </Text>
                    {hasLocation && (
                      <View style={styles.userBadgeStatus}>
                        <View style={styles.userBadgeStatusDot} />
                        <Text style={styles.userBadgeStatusText}>Live</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </>
      ) : (
        <View style={styles.noLocationContainer}>
          <MaterialCommunityIcons name="map-search" size={64} color="#9AA0A6" />
          <Text style={styles.noLocationTitle}>Locations Not Available</Text>
          <Text style={styles.noLocationSubtitle}>
            Waiting for users to share their locations...
          </Text>
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
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
  },
  subtitle: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 2,
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
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111318',
    marginTop: 16,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#4B5057',
    textAlign: 'center',
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
  centerButton: {
    position: 'absolute',
    bottom: 100,
    right: 16,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
  },
  usersListContainer: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E2',
    paddingVertical: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  usersList: {
    paddingHorizontal: 12,
  },
  userBadge: {
    alignItems: 'center',
    marginHorizontal: 8,
    paddingVertical: 8,
  },
  userBadgeInactive: {
    opacity: 0.6,
  },
  userBadgeAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4F2CF5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  userBadgeAvatarInactive: {
    backgroundColor: '#D1D5DB',
  },
  userBadgeAvatarText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
  userBadgeName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#111318',
    maxWidth: 60,
    textAlign: 'center',
    marginBottom: 2,
  },
  userBadgeStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 2,
    backgroundColor: '#D1FAE5',
    borderRadius: 6,
  },
  userBadgeStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  userBadgeStatusText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#059669',
  },
});

export default GroupLocationMapScreen;
