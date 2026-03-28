import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { auth } from '../config/firebase';
import { subscribeToAlertHistory } from '../services/alertHistoryService';
import { formatAlertTime } from '../services/alertLifecycleService';
import { getConnectedUsers } from '../services/profile';

const AlertHistoryScreen = ({ navigation, route }) => {
  const { isGuardian } = route.params || { isGuardian: false };
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connectedUsers, setConnectedUsers] = useState([]); // Used if guardian to map user names

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true);
        const currentUser = auth.currentUser;
        if (!currentUser) {
          navigation.replace('Login');
          return;
        }

        let uidsForQuery = [];

        if (isGuardian) {
          const users = await getConnectedUsers(currentUser.uid);
          setConnectedUsers(users);
          uidsForQuery = users.map((u) => u.id);

          if (uidsForQuery.length === 0) {
            setLoading(false);
            return; // No connected users, history will be empty
          }
        }

        const unsubscribe = subscribeToAlertHistory(
          currentUser.uid,
          isGuardian,
          uidsForQuery,
          (historyAlerts) => {
            setAlerts(historyAlerts);
            setLoading(false);
          },
          (err) => {
            console.error('[AlertHistoryScreen] fetch history error:', err);
            setError('Failed to load alert history');
            setLoading(false);
          }
        );

        return () => {
          unsubscribe();
        };
      } catch (err) {
        console.error('[AlertHistoryScreen] setup error:', err);
        setError('An unexpected error occurred');
        setLoading(false);
      }
    };

    const cleanupPromise = fetchHistory();

    return () => {
      cleanupPromise.then((cleanup) => {
        if (typeof cleanup === 'function') cleanup();
      });
    };
  }, [isGuardian, navigation]);

  const renderAlertItem = ({ item }) => {
    const isResolved = item.status === 'resolved';
    const isResponding = item.status === 'responding';

    let statusColor = '#EF4444';
    let statusIcon = 'alert-decagram';
    let statusText = 'ACTIVE';

    if (isResponding) {
      statusColor = '#F59E0B';
      statusIcon = 'shield-account';
      statusText = 'RESPONDING';
    } else if (isResolved) {
      statusColor = '#10B981';
      statusIcon = 'check-decagram';
      statusText = 'RESOLVED';
    }

    // Determine whose alert this is
    let alertName = 'You';
    if (isGuardian) {
      const u = connectedUsers.find((u) => u.id === item.userId);
      alertName = u ? u.name : 'Unknown User';
    }

    return (
      <TouchableOpacity
        style={[styles.alertCard, { borderLeftColor: statusColor }]}
        activeOpacity={0.7}
        onPress={() => navigation.push('AlertTimeline', { alertId: item.id, alertName })}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.alertName}>{alertName}&apos;s Emergency</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <MaterialCommunityIcons name={statusIcon} size={12} color="#fff" />
            <Text style={styles.statusText}>{statusText}</Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.infoRow}>
            <MaterialCommunityIcons name="clock-outline" size={16} color="#6B7280" />
            <Text style={styles.infoText}>{formatAlertTime(item.timestamp)}</Text>
          </View>
          {item.status !== 'active' && item.status && (
            <View style={styles.infoRow}>
              <MaterialCommunityIcons name="account-hard-hat" size={16} color="#6B7280" />
              <Text style={styles.infoText}>
                {item.status === 'resolved' ? 'Resolved' : 'Responded'} at{' '}
                {formatAlertTime(item.status === 'resolved' ? item.resolvedAt : item.respondedAt)}
              </Text>
            </View>
          )}
        </View>

        <MaterialCommunityIcons
          name="chevron-right"
          size={24}
          color="#9CA3AF"
          style={styles.chevron}
        />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#111318" />
        </TouchableOpacity>
        <Text style={styles.title}>Alert History</Text>
        <View style={{ width: 40 }} /> {/* Spacer for balance */}
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4F2CF5" />
          <Text style={styles.loadingText}>Loading history...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#EF4444" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => navigation.replace('AlertHistory', { isGuardian })}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : alerts.length === 0 ? (
        <View style={styles.centerContainer}>
          <MaterialCommunityIcons name="history" size={64} color="#9CA3AF" />
          <Text style={styles.emptyTitle}>No Alert History</Text>
          <Text style={styles.emptySubtitle}>
            {isGuardian
              ? "Your connected users haven't triggered any alerts."
              : "You haven't triggered any SOS alerts yet."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={alerts}
          keyExtractor={(item) => item.id}
          renderItem={renderAlertItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111318',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    color: '#6B7280',
    fontSize: 14,
  },
  errorText: {
    marginTop: 12,
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
  },
  retryText: {
    color: '#111318',
    fontWeight: '600',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111318',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
  },
  listContent: {
    padding: 16,
  },
  alertCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  alertName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111318',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 4,
  },
  statusText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  cardBody: {
    gap: 6,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoText: {
    fontSize: 13,
    color: '#4B5057',
  },
  chevron: {
    position: 'absolute',
    right: 12,
    top: '50%',
    transform: [{ translateY: -12 }],
  },
});

export default AlertHistoryScreen;
