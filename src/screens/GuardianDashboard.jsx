import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { auth } from '../config/firebase';
import GuardianInviteItem from '../components/GuardianInviteItem';
import ConnectedUserItem from '../components/ConnectedUserItem';
import {
  fetchPendingInvites,
  acceptInvite,
  rejectInvite,
  getInviteErrorMessage,
} from '../services/guardianInvites';
import {
  requestLocationPermission,
  startLocationTracking,
  stopLocationTracking,
  getLocationErrorMessage,
} from '../services/location';
import { getConnectedUsers } from '../services/profile';
import { subscribeToUserLocation } from '../services/locationListener';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  subscribeToAlerts,
  respondToAlert,
  resolveAlert,
  getAlertLifecycleErrorMessage,
  formatAlertTime,
} from '../services/alertLifecycleService';
import logger from '../utils/logger';

const TAG = '[GuardianDashboard]';

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: Alert Card
// ─────────────────────────────────────────────────────────────────────────────
const AlertCard = ({ alert, connectedUsers, currentUserId, onRespond, onResolve, loading }) => {
  const user = connectedUsers.find((u) => u.id === alert.userId);
  const userName = user ? user.name : 'Unknown User';
  const timeStr = formatAlertTime(alert.timestamp);

  const isResponding = alert.status === 'responding';
  const isResolved = alert.status === 'resolved';
  const isCancelled = alert.status === 'cancelled';

  let statusText = 'ACTIVE SOS';
  let badgeColor = '#EF4444'; // Red
  let iconName = 'alert-decagram';
  if (isResponding) {
    statusText = 'RESPONDING';
    badgeColor = '#F59E0B'; // Amber
    iconName = 'shield-account';
  } else if (isResolved) {
    statusText = 'RESOLVED';
    badgeColor = '#10B981'; // Green
    iconName = 'check-decagram';
  } else if (isCancelled) {
    statusText = 'CANCELLED';
    badgeColor = '#6B7280'; // Grey
    iconName = 'close-octagon';
  }

  // Treat missing status as 'active' for legacy compatibility
  const isActive = alert.status === 'active' || !alert.status;

  const respondedByMe = alert.respondedBy === currentUserId;
  let responderText = null;
  if (isResponding && alert.respondedBy) {
    responderText = respondedByMe ? 'Responded by you' : 'Responded by another guardian';
  }
  if (isCancelled) {
    responderText = `Cancelled ${formatAlertTime(alert.cancelledAt || alert.updatedAt || alert.timestamp)}`;
  }

  const isCardLoading = loading === alert.id;

  return (
    <View style={[styles.alertCard, { borderLeftColor: badgeColor }]}>
      <View style={styles.alertCardHeader}>
        <View style={styles.alertUserRow}>
          <MaterialCommunityIcons name="account-alert" size={20} color="#111318" />
          <Text style={styles.alertUserName}>{userName}</Text>
        </View>
        <View style={[styles.alertBadge, { backgroundColor: badgeColor }]}>
          <MaterialCommunityIcons name={iconName} size={12} color="#fff" />
          <Text style={styles.alertBadgeText}>{statusText}</Text>
        </View>
      </View>

      <View style={styles.alertDetails}>
        <View style={styles.alertMetaRow}>
          <MaterialCommunityIcons name="clock-outline" size={14} color="#6B7280" />
          <Text style={styles.alertTime}>{timeStr}</Text>
        </View>
        {responderText && (
          <View style={styles.alertMetaRow}>
            <MaterialCommunityIcons name="account-hard-hat" size={14} color="#6B7280" />
            <Text style={styles.alertResponder}>{responderText}</Text>
          </View>
        )}
      </View>

      {!isResolved && !isCancelled && (
        <View style={styles.alertActions}>
          {isActive && (
            <TouchableOpacity
              style={[styles.alertButton, styles.alertButtonRespond]}
              onPress={() => onRespond(alert.id)}
              disabled={isCardLoading}
            >
              {isCardLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.alertButtonText}>Respond to Alert</Text>
              )}
            </TouchableOpacity>
          )}

          {(isActive || isResponding) && (
            <TouchableOpacity
              style={[
                styles.alertButton,
                styles.alertButtonResolve,
                isActive && styles.alertButtonSecondary,
              ]}
              onPress={() => onResolve(alert.id)}
              disabled={isCardLoading}
            >
              <Text style={[styles.alertButtonText, isActive && styles.alertButtonTextSecondary]}>
                Mark as Resolved
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Dashboard Component
// ─────────────────────────────────────────────────────────────────────────────
const GuardianDashboard = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [pendingInvites, setPendingInvites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processingInviteId, setProcessingInviteId] = useState(null);
  const [error, setError] = useState(null);

  // Location tracking state
  const [locationError, setLocationError] = useState(null);
  const locationTrackingSubscriptionRef = useRef(null);

  // Connected users state
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [userLocations, setUserLocations] = useState({});
  const [loadingConnectedUsers, setLoadingConnectedUsers] = useState(false);
  const userLocationSubscriptionsRef = useRef({});

  // Alert Lifecycle state
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [respondingAlerts, setRespondingAlerts] = useState([]);
  const [resolvedAlerts, setResolvedAlerts] = useState([]);
  const [cancelledAlerts, setCancelledAlerts] = useState([]);
  const [processingAlertId, setProcessingAlertId] = useState(null);

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
    } catch (err) {
      logger.error(TAG, 'Error loading invites:', err);
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

      Object.values(userLocationSubscriptionsRef.current).forEach((unsubscribe) => {
        if (typeof unsubscribe === 'function') unsubscribe();
      });

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
            logger.error(TAG, 'Location subscription error for user:', user.id, err);
          }
        );

        newSubscriptions[user.id] = unsubscribe;
      });

      userLocationSubscriptionsRef.current = newSubscriptions;
    } catch (err) {
      logger.error(TAG, 'Error loading connected users:', err);
    } finally {
      setLoadingConnectedUsers(false);
    }
  }, [navigation]);

  // Alert Subscription Setup
  useEffect(() => {
    if (connectedUsers.length === 0) return;

    const userIds = connectedUsers.map((u) => u.id);
    const unsubscribe = subscribeToAlerts(
      userIds,
      (alerts) => {
        setActiveAlerts(alerts.filter((a) => a.status === 'active' || !a.status));
        setRespondingAlerts(alerts.filter((a) => a.status === 'responding'));
        setResolvedAlerts(alerts.filter((a) => a.status === 'resolved'));
        setCancelledAlerts(alerts.filter((a) => a.status === 'cancelled'));
      },
      (err) => {
        logger.error(TAG, 'Alerts subscription error:', err);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [connectedUsers]);

  // Initial load
  useEffect(() => {
    loadPendingInvites();
    loadConnectedUsers();
  }, [loadPendingInvites, loadConnectedUsers]);

  // Reload when screen is focused
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

  // Auto-dismiss location error messages after 4 seconds
  useEffect(() => {
    if (locationError) {
      const timeout = setTimeout(() => setLocationError(null), 4000);
      return () => clearTimeout(timeout);
    }
  }, [locationError]);

  // Location tracking initialization
  useEffect(() => {
    const initializeLocationTracking = async () => {
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
          navigation?.replace('Login');
          return;
        }

        const permissionResult = await requestLocationPermission();
        if (!permissionResult.granted) {
          setLocationError({
            message: permissionResult.message || 'Location permission required',
            type: 'warning',
          });
          return;
        }

        locationTrackingSubscriptionRef.current = await startLocationTracking(currentUser.uid);
      } catch (err) {
        setLocationError({
          message: getLocationErrorMessage(err),
          type: 'error',
        });
      }
    };

    initializeLocationTracking();

    return () => {
      stopLocationTracking(locationTrackingSubscriptionRef.current);
      locationTrackingSubscriptionRef.current = null;
    };
  }, [navigation]);

  // Cleanup location subscriptions
  useEffect(() => {
    return () => {
      Object.values(userLocationSubscriptionsRef.current).forEach((unsubscribe) => {
        if (typeof unsubscribe === 'function') unsubscribe();
      });
      userLocationSubscriptionsRef.current = {};
    };
  }, []);

  // ── Invite Actions ───────────────────────────────────────────────────────────
  const handleAcceptInvite = async (inviteId) => {
    try {
      setProcessingInviteId(inviteId);
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      await acceptInvite(inviteId, currentUser.uid, currentUser.email);
      setPendingInvites((prev) => prev.filter((invite) => invite.id !== inviteId));
      setError({ message: 'Invite accepted successfully!', type: 'success' });
    } catch (err) {
      setError({ message: getInviteErrorMessage(err), type: 'error' });
    } finally {
      setProcessingInviteId(null);
    }
  };

  const handleRejectInvite = async (inviteId) => {
    try {
      setProcessingInviteId(inviteId);
      await rejectInvite(inviteId);
      setPendingInvites((prev) => prev.filter((invite) => invite.id !== inviteId));
      setError({ message: 'Invite rejected', type: 'success' });
    } catch (err) {
      setError({ message: getInviteErrorMessage(err), type: 'error' });
    } finally {
      setProcessingInviteId(null);
    }
  };

  // ── Alert Actions ────────────────────────────────────────────────────────────
  const handleRespondToAlert = async (alertId) => {
    try {
      setProcessingAlertId(alertId);
      await respondToAlert(alertId, auth.currentUser.uid);
      setError({ message: 'You are now responding to the alert', type: 'success' });
    } catch (err) {
      setError({ message: getAlertLifecycleErrorMessage(err), type: 'error' });
    } finally {
      setProcessingAlertId(null);
    }
  };

  const handleResolveAlert = async (alertId) => {
    try {
      setProcessingAlertId(alertId);
      await resolveAlert(alertId, auth.currentUser.uid);
      setError({ message: 'Alert marked as resolved', type: 'success' });
    } catch (err) {
      setError({ message: getAlertLifecycleErrorMessage(err), type: 'error' });
    } finally {
      setProcessingAlertId(null);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Error Toast - General */}
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
          <View>
            <Text style={styles.title}>Guardian Dashboard</Text>
            <Text style={styles.subtitle}>Protecting your connected users</Text>
          </View>
          <TouchableOpacity
            style={styles.historyButton}
            onPress={() => navigation.push('AlertHistory', { isGuardian: true })}
          >
            <MaterialCommunityIcons name="history" size={24} color="#4F2CF5" />
          </TouchableOpacity>
        </View>

        {/* ── ALERTS SECTION ──────────────────────────────────────────────────────── */}

        {/* Active Alerts */}
        {activeAlerts.length > 0 && (
          <View style={styles.alertSection}>
            <Text style={styles.alertSectionTitleActive}>🚨 Active Emergencies</Text>
            {activeAlerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                connectedUsers={connectedUsers}
                currentUserId={auth.currentUser?.uid}
                onRespond={handleRespondToAlert}
                onResolve={handleResolveAlert}
                loading={processingAlertId}
              />
            ))}
          </View>
        )}

        {/* Responding Alerts */}
        {respondingAlerts.length > 0 && (
          <View style={styles.alertSection}>
            <Text style={styles.alertSectionTitleResponding}>🛡️ Responding</Text>
            {respondingAlerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                connectedUsers={connectedUsers}
                currentUserId={auth.currentUser?.uid}
                onRespond={handleRespondToAlert}
                onResolve={handleResolveAlert}
                loading={processingAlertId}
              />
            ))}
          </View>
        )}

        {/* Resolved Alerts (Recent) */}
        {resolvedAlerts.length > 0 && (
          <View style={styles.alertSection}>
            <Text style={styles.alertSectionTitleResolved}>✅ Recently Resolved</Text>
            {resolvedAlerts.slice(0, 3).map(
              (
                alert // Show only the 3 most recent
              ) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  connectedUsers={connectedUsers}
                  currentUserId={auth.currentUser?.uid}
                  onRespond={null}
                  onResolve={null}
                  loading={false}
                />
              )
            )}
          </View>
        )}

        {/* Cancelled Alerts (Recent) */}
        {cancelledAlerts.length > 0 && (
          <View style={styles.alertSection}>
            <Text style={styles.alertSectionTitleCancelled}>🚫 Cancelled Alerts</Text>
            {cancelledAlerts.slice(0, 3).map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                connectedUsers={connectedUsers}
                currentUserId={auth.currentUser?.uid}
                onRespond={null}
                onResolve={null}
                loading={false}
              />
            ))}
          </View>
        )}

        {/* ── CONNECTED USERS ──────────────────────────────────────────────────────── */}
        {connectedUsers.length > 0 && (
          <View style={styles.connectedUsersSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Connected Users</Text>
              {loadingConnectedUsers && <ActivityIndicator size="small" color="#4F2CF5" />}
            </View>

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
          </View>
        )}

        {/* ── PENDING INVITES ──────────────────────────────────────────────────────── */}
        {pendingInvites.length > 0 && (
          <View style={styles.invitesSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Pending Invites ({pendingInvites.length})</Text>
            </View>
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
          </View>
        )}

        {loading && !pendingInvites.length && !connectedUsers.length && (
          <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#4F2CF5" />
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#E9EAEE',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  historyButton: {
    padding: 8,
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
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

  // ALERTS UI
  alertSection: {
    marginHorizontal: 16,
    marginBottom: 20,
  },
  alertSectionTitleActive: {
    fontSize: 16,
    fontWeight: '800',
    color: '#DC2626', // Red
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  alertSectionTitleResponding: {
    fontSize: 16,
    fontWeight: '800',
    color: '#D97706', // Amber
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  alertSectionTitleResolved: {
    fontSize: 16,
    fontWeight: '800',
    color: '#059669', // Green
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  alertSectionTitleCancelled: {
    fontSize: 16,
    fontWeight: '800',
    color: '#4B5563', // Slate
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  alertCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    borderLeftWidth: 4,
  },
  alertCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  alertUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  alertUserName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111318',
  },
  alertBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  alertBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  alertDetails: {
    marginBottom: 16,
    gap: 4,
  },
  alertMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  alertTime: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  alertResponder: {
    fontSize: 13,
    color: '#4B5057',
    fontWeight: '600',
  },
  alertActions: {
    flexDirection: 'row',
    gap: 8,
  },
  alertButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertButtonRespond: {
    backgroundColor: '#EF4444',
  },
  alertButtonResolve: {
    backgroundColor: '#10B981',
  },
  alertButtonSecondary: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  alertButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  alertButtonTextSecondary: {
    color: '#4B5057',
  },

  // OTHER UI
  connectedUsersSection: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 20,
    borderRadius: 12,
    paddingVertical: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  invitesSection: {
    marginHorizontal: 16,
    marginBottom: 20,
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
  invitesCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#E0E0E2',
    marginVertical: 8,
  },
});

export default GuardianDashboard;
