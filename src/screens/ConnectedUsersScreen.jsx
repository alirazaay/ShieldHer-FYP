import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { auth } from '../config/firebase';
import ConnectedUserItem from '../components/ConnectedUserItem';
import { getConnectedUsers } from '../services/profile';
import { subscribeToUserLocation } from '../services/locationListener';
import logger from '../utils/logger';

const TAG = '[ConnectedUsersScreen]';

const ConnectedUsersScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [userLocations, setUserLocations] = useState({});
  const subscriptionsRef = useRef({});

  const loadUsers = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const currentUser = auth.currentUser;
      if (!currentUser) {
        navigation.replace('Login');
        return;
      }

      const users = await getConnectedUsers(currentUser.uid);
      setConnectedUsers(users);

      Object.values(subscriptionsRef.current).forEach((unsubscribe) => {
        if (typeof unsubscribe === 'function') unsubscribe();
      });

      const nextSubscriptions = {};
      users.forEach((user) => {
        nextSubscriptions[user.id] = subscribeToUserLocation(
          user.id,
          (location) => {
            setUserLocations((prev) => ({ ...prev, [user.id]: location }));
          },
          (error) => {
            logger.error(TAG, 'Location subscribe failed:', user.id, error);
          }
        );
      });

      subscriptionsRef.current = nextSubscriptions;
    } catch (error) {
      logger.error(TAG, 'Failed to load connected users:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      loadUsers();
    }, [loadUsers])
  );

  useEffect(() => {
    return () => {
      Object.values(subscriptionsRef.current).forEach((unsubscribe) => {
        if (typeof unsubscribe === 'function') unsubscribe();
      });
      subscriptionsRef.current = {};
    };
  }, []);

  const liveUsersCount = useMemo(
    () =>
      connectedUsers.filter((user) => {
        const location = userLocations[user.id];
        return Number.isFinite(Number(location?.latitude)) && Number.isFinite(Number(location?.longitude));
      }).length,
    [connectedUsers, userLocations]
  );

  const handleViewLocation = useCallback(
    (user, userLocation) => {
      const latitude = Number(userLocation?.latitude);
      const longitude = Number(userLocation?.longitude);
      const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);

      navigation.push('UserLocationMap', {
        userId: user.id,
        latitude: hasCoordinates ? latitude : undefined,
        longitude: hasCoordinates ? longitude : undefined,
      });
    },
    [navigation]
  );

  const onRefresh = useCallback(async () => {
    await loadUsers(true);
  }, [loadUsers]);

  return (
    <SafeAreaView style={[styles.safe, { paddingTop: insets.top + 8 }]} edges={['left', 'right', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <MaterialCommunityIcons name="arrow-left" size={20} color="#111318" />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>Connected Users</Text>
          <Text style={styles.subtitle}>Monitor live location updates for linked users</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statsCard}>
          <Text style={styles.statsValue}>{connectedUsers.length}</Text>
          <Text style={styles.statsLabel}>Total Linked</Text>
        </View>
        <View style={styles.statsCard}>
          <Text style={styles.statsValue}>{liveUsersCount}</Text>
          <Text style={styles.statsLabel}>Live Now</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color="#4F2CF5" />
        </View>
      ) : connectedUsers.length === 0 ? (
        <View style={styles.emptyWrap}>
          <MaterialCommunityIcons name="account-off-outline" size={30} color="#9CA3AF" />
          <Text style={styles.emptyTitle}>No connected users yet</Text>
          <Text style={styles.emptyText}>Accepted guardian invites will appear here.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#4F2CF5']}
              tintColor="#4F2CF5"
            />
          }
        >
          {connectedUsers.map((user, index) => (
            <View style={styles.itemCard} key={user.id}>
              <ConnectedUserItem
                user={user}
                userLocation={userLocations[user.id]}
                onViewLocation={handleViewLocation}
                loading={false}
              />
              {index < connectedUsers.length - 1 && <View style={styles.divider} />}
            </View>
          ))}

          <TouchableOpacity style={styles.refreshButton} onPress={onRefresh} activeOpacity={0.85}>
            <MaterialCommunityIcons name="refresh" size={16} color="#4F2CF5" />
            <Text style={styles.refreshText}>Refresh List</Text>
          </TouchableOpacity>
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
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111318',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 13,
    color: '#5B6067',
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 10,
  },
  statsCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E8EAF6',
  },
  statsValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111318',
  },
  statsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111318',
  },
  emptyText: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 28,
    gap: 10,
  },
  itemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginTop: 6,
  },
  refreshButton: {
    marginTop: 2,
    backgroundColor: '#EEF2FF',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  refreshText: {
    color: '#4F2CF5',
    fontSize: 12,
    fontWeight: '800',
  },
});

export default ConnectedUsersScreen;
