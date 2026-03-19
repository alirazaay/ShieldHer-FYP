import React, { useState, useEffect, useCallback } from 'react';
import { SafeAreaView, View, Text, StyleSheet, FlatList, ActivityIndicator, ScrollView, useSafeAreaInsets } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { auth } from '../config/firebase';
import GuardianInviteItem from '../components/GuardianInviteItem';
import { fetchPendingInvites, acceptInvite, rejectInvite, getInviteErrorMessage } from '../services/guardianInvites';
import { requestLocationPermission, startLocationTracking, stopLocationTracking, getLocationErrorMessage } from '../services/location';
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

  // Initial load
  useEffect(() => {
    loadPendingInvites();
  }, [loadPendingInvites]);

  // Reload when screen is focused (back from other screens)
  useFocusEffect(
    useCallback(() => {
      loadPendingInvites();
    }, [loadPendingInvites])
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
});

export default GuardianDashboard;
