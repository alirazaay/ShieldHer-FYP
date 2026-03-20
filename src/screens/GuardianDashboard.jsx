import React, { useState, useEffect, useCallback } from 'react';
import { SafeAreaView, View, Text, StyleSheet, FlatList, ActivityIndicator, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { auth } from '../config/firebase';
import GuardianInviteItem from '../components/GuardianInviteItem';
import ConnectedUserItem from '../components/ConnectedUserItem';
import { fetchPendingInvites, acceptInvite, rejectInvite, getInviteErrorMessage } from '../services/guardianInvites';
import { requestLocationPermission, startLocationTracking, stopLocationTracking, getLocationErrorMessage } from '../services/location';
import { getConnectedUsers } from '../services/profile';
import { subscribeToUserLocation } from '../services/locationListener';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const GuardianDashboard = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [pendingInvites, setPendingInvites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processingInviteId, setProcessingInviteId] = useState(null);
  const [error, setError] = useState(null);

  // Location tracking state
  const [locationTracking, setLocationTracking] = useState(false);
  const [locationError, setLocationError] = useState(null);
  const [locationSubscription, setLocationSubscription] = useState(null);

  // Connected users state
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [userLocations, setUserLocations] = useState({});
  const [loadingConnectedUsers, setLoadingConnectedUsers] = useState(false);
  const [locationSubscriptions, setLocationSubscriptions] = useState({});

  const loadPendingInvites = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const currentUser = auth.currentUser;
      if (!currentUser) {
        navigation?.replace('Login');
        return;
      }

      const invites = await fetchPendingInvites(currentUser.email);
      setPendingInvites(invites);

      console.log('[GuardianDashboard] Loaded pending invites:', invites.length);
    } catch (err) {
      console.error('[GuardianDashboard] Error loading invites:', err);
      setError({ message: getInviteErrorMessage(err), type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [navigation]);

  const loadConnectedUsers = useCallback(async () => {
    try {
      setLoadingConnectedUsers(true);

      const currentUser = auth.currentUser;
      if (!currentUser) {
        navigation?.replace('Login');
        return;
      }

      // Fetch connected users
      const users = await getConnectedUsers(currentUser.uid);
      setConnectedUsers(users);

      // Subscribe to each user's location
      const newSubscriptions = {};

      users.forEach((user) => {
        const unsubscribe = subscribeToUserLocation(
          user.id,
          (location) => {
            setUserLocations((prev) => ({
              ...prev,
              [user.id]: location,
            }));
          },
          (err) => {
            console.error('[GuardianDashboard] Location subscription error for user:', user.id, err);
          }
        );

        newSubscriptions[user.id] = unsubscribe;
      });

      setLocationSubscriptions(newSubscriptions);
      console.log('[GuardianDashboard] Loaded connected users:', users.length);
    } catch (err) {
      console.error('[GuardianDashboard] Error loading connected users:', err);
    } finally {
      setLoadingConnectedUsers(false);
    }
  }, [navigation]);

  // Initial load
  useEffect(() => {
    loadPendingInvites();
    loadConnectedUsers();
  }, [loadPendingInvites, loadConnectedUsers]);

  // Reload when screen is focused (back from other screens)
  useFocusEffect(
    useCallback(() => {
      loadPendingInvites();
      loadConnectedUsers();
    }, [loadPendingInvites, loadConnectedUsers])
  );

  // Auto-dismiss error after 4 seconds
  useEffect(() => {
    if (error) {
      const timeout = setTimeout(() => setError(null), 4000);
      return () => clearTimeout(timeout);
    }
  }, [error]);

  // Location tracking initialization
  useEffect(() => {
    const initializeLocationTracking = async () => {
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
          navigation?.replace('Login');
          return;
        }

        // Request location permission
        const permissionResult = await requestLocationPermission();
        if (!permissionResult.granted) {
          console.warn('[GuardianDashboard] Location permission not granted:', permissionResult.status);
          setLocationError({
            message: permissionResult.message || 'Location permission required',
            type: 'warning',
          });
          return;
        }

        // Start tracking location
        const subscription = await startLocationTracking(currentUser.uid);
        setLocationSubscription(subscription);
        setLocationTracking(true);
        console.log('[GuardianDashboard] Location tracking started');
      } catch (err) {
        console.error('[GuardianDashboard] Location tracking initialization error:', err);
        setLocationError({
          message: getLocationErrorMessage(err),
          type: 'error',
        });
      }
    };

    initializeLocationTracking();

    // Cleanup: stop location tracking when component unmounts
    return () => {
      if (locationSubscription) {
        stopLocationTracking(locationSubscription);
        setLocationTracking(false);
        console.log('[GuardianDashboard] Location tracking stopped');
      }
    };
  }, [navigation]);

  // Auto-dismiss location error messages after 4 seconds
  useEffect(() => {
    if (locationError) {
      const timeout = setTimeout(() => setLocationError(null), 4000);
      return () => clearTimeout(timeout);
    }
  }, [locationError]);

  // Cleanup location subscriptions when component unmounts
  useEffect(() => {
    return () => {
      Object.values(locationSubscriptions).forEach((unsubscribe) => {
        if (unsubscribe) unsubscribe();
      });
      console.log('[GuardianDashboard] Location subscriptions cleaned up');
    };
  }, [locationSubscriptions]);

  const handleAcceptInvite = async (inviteId) => {
    try {
      setProcessingInviteId(inviteId);
      const currentUser = auth.currentUser;
      if (!currentUser) {
        navigation?.replace('Login');
        return;
      }

      await acceptInvite(inviteId, currentUser.uid, currentUser.email);

      // Remove the accepted invite from the list
      setPendingInvites((prev) => prev.filter((invite) => invite.id !== inviteId));

      setError({ message: 'Invite accepted successfully!', type: 'success' });
      console.log('[GuardianDashboard] Invite accepted:', inviteId);
    } catch (err) {
      console.error('[GuardianDashboard] Error accepting invite:', err);
      setError({ message: getInviteErrorMessage(err), type: 'error' });
    } finally {
      setProcessingInviteId(null);
    }
  };

  const handleRejectInvite = async (inviteId) => {
    try {
      setProcessingInviteId(inviteId);

      await rejectInvite(inviteId);

      // Remove the rejected invite from the list
      setPendingInvites((prev) => prev.filter((invite) => invite.id !== inviteId));

      setError({ message: 'Invite rejected', type: 'success' });
      console.log('[GuardianDashboard] Invite rejected:', inviteId);
    } catch (err) {
      console.error('[GuardianDashboard] Error rejecting invite:', err);
      setError({ message: getInviteErrorMessage(err), type: 'error' });
    } finally {
      setProcessingInviteId(null);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { paddingTop: insets.top }]}>
      {/* Error Toast - Invites */}
      {error && (
        <View
          style={[
            styles.messageContainer,
            error.type === 'success' ? styles.messageSuccess : styles.messageError,
          ]}
        >
          <MaterialCommunityIcons
            name={error.type === 'success' ? 'check-circle' : 'alert-circle'}
            size={16}
            color={error.type === 'success' ? '#059669' : '#DC2626'}
          />
          <Text
            style={[
              styles.messageText,
              { color: error.type === 'success' ? '#059669' : '#DC2626' },
            ]}
          >
            {error.message}
          </Text>
        </View>
      )}

      {/* Error Toast - Location */}
      {locationError && (
        <View
          style={[
            styles.messageContainer,
            locationError.type === 'error' ? styles.messageError : styles.messageWarning,
          ]}
        >
          <MaterialCommunityIcons
            name={locationError.type === 'error' ? 'alert-circle' : 'information'}
            size={16}
            color={locationError.type === 'error' ? '#EF4444' : '#F59E0B'}
          />
          <Text
            style={[
              styles.messageText,
              { color: locationError.type === 'error' ? '#EF4444' : '#F59E0B' },
            ]}
          >
            {locationError.message}
          </Text>
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Pending Invites</Text>
        <Text style={styles.subtitle}>
          {pendingInvites.length > 0
            ? `You have ${pendingInvites.length} pending invite${pendingInvites.length !== 1 ? 's' : ''}`
            : 'No pending invites'}
        </Text>
      </View>

      {/* Loading State */}
      {loading && (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4F2CF5" />
          <Text style={styles.loadingText}>Loading invites...</Text>
        </View>
      )}

      {/* Empty State */}
      {!loading && pendingInvites.length === 0 && (
        <View style={styles.centerContainer}>
          <MaterialCommunityIcons name="inbox-outline" size={64} color="#9AA0A6" />
          <Text style={styles.emptyStateTitle}>No Pending Invites</Text>
          <Text style={styles.emptyStateSubtitle}>
            When users invite you to be their guardian, they'll appear here
          </Text>
        </View>
      )}

      {/* Invites List */}
      {!loading && pendingInvites.length > 0 && (
        <ScrollView
          style={styles.listContainer}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.invitesCard}>
            {pendingInvites.map((invite, index) => (
              <View key={invite.id}>
                <GuardianInviteItem
                  invite={invite}
                  onAccept={handleAcceptInvite}
                  onReject={handleRejectInvite}
                  loading={processingInviteId}
                />
                {index < pendingInvites.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {/* Connected Users Section */}
      {connectedUsers.length > 0 && (
        <View style={styles.connectedUsersSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Connected Users</Text>
            {loadingConnectedUsers && <ActivityIndicator size="small" color="#4F2CF5" />}
          </View>

          {connectedUsers.length > 0 ? (
            <View style={styles.usersScrollContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.usersHorizontalScroll}
                contentContainerStyle={styles.usersScrollContent}
              >
                {connectedUsers.map((user) => (
                  <TouchableOpacity
                    key={user.id}
                    onPress={() => navigation.push('UserLocationMap', { userId: user.id })}
                    style={styles.userQuickCard}
                    activeOpacity={0.8}
                  >
                    <View style={styles.userQuickAvatar}>
                      <Text style={styles.userQuickAvatarText}>
                        {user.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .toUpperCase()
                          .slice(0, 2)}
                      </Text>
                    </View>
                    <Text style={styles.userQuickName} numberOfLines={1}>
                      {user.name}
                    </Text>
                    {userLocations[user.id] && (
                      <View style={styles.userQuickStatus}>
                        <View style={styles.userQuickStatusDot} />
                        <Text style={styles.userQuickStatusText}>Live</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}

                {/* "View All Locations" Card */}
                <TouchableOpacity
                  onPress={() => navigation.push('GroupLocationMap')}
                  style={styles.userQuickCardAll}
                  activeOpacity={0.8}
                >
                  <View style={styles.userQuickAvatarAll}>
                    <MaterialCommunityIcons name="map" size={24} color="#4F2CF5" />
                  </View>
                  <Text style={styles.userQuickNameAll}>All</Text>
                  <Text style={styles.userQuickNameAllSmall}>Locations</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          ) : null}

          {/* Full List of Connected Users */}
          {connectedUsers.length > 0 && (
            <View style={styles.usersList}>
              {connectedUsers.map((user, index) => (
                <View key={user.id}>
                  <ConnectedUserItem
                    user={user}
                    userLocation={userLocations[user.id]}
                    onViewLocation={(userId) => navigation.push('UserLocationMap', { userId })}
                    loading={false}
                  />
                  {index < connectedUsers.length - 1 && <View style={styles.divider} />}
                </View>
              ))}
            </View>
          )}
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
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#E9EAEE',
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#111318',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#4B5057',
  },
  messageContainer: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  messageSuccess: {
    backgroundColor: '#D1FAE5',
  },
  messageError: {
    backgroundColor: '#FEE2E2',
  },
  messageWarning: {
    backgroundColor: '#FEF3C7',
  },
  messageText: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#4B5057',
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111318',
    marginTop: 16,
    marginBottom: 4,
  },
  emptyStateSubtitle: {
    fontSize: 13,
    color: '#4B5057',
    textAlign: 'center',
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  invitesCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },
  divider: {
    height: 1,
    backgroundColor: '#E0E0E2',
    marginVertical: 8,
  },
  connectedUsersSection: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    paddingVertical: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111318',
  },
  usersScrollContainer: {
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  usersHorizontalScroll: {
    marginHorizontal: -12,
  },
  usersScrollContent: {
    paddingHorizontal: 12,
    gap: 8,
  },
  userQuickCard: {
    alignItems: 'center',
    minWidth: 70,
    paddingHorizontal: 6,
  },
  userQuickCardAll: {
    alignItems: 'center',
    minWidth: 70,
    paddingHorizontal: 6,
  },
  userQuickAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#4F2CF5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  userQuickAvatarAll: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  userQuickAvatarText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
  userQuickName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#111318',
    maxWidth: 60,
    textAlign: 'center',
    marginBottom: 2,
  },
  userQuickNameAll: {
    fontSize: 11,
    fontWeight: '600',
    color: '#111318',
    maxWidth: 60,
    textAlign: 'center',
  },
  userQuickNameAllSmall: {
    fontSize: 9,
    fontWeight: '500',
    color: '#4B5057',
    maxWidth: 60,
    textAlign: 'center',
  },
  userQuickStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    paddingHorizontal: 4,
    paddingVertical: 1,
    backgroundColor: '#D1FAE5',
    borderRadius: 4,
    marginTop: 2,
  },
  userQuickStatusDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#10B981',
  },
  userQuickStatusText: {
    fontSize: 8,
    fontWeight: '600',
    color: '#059669',
  },
  usersList: {
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E2',
    paddingTop: 12,
  },
});

export default GuardianDashboard;
