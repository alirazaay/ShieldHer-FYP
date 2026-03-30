import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { subscribeToAlertTimeline } from '../services/alertHistoryService';
import { formatAlertTime } from '../services/alertLifecycleService';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import logger from '../utils/logger';

const TAG = '[AlertTimelineScreen]';

function hasFiniteCoordinates(metadata) {
  if (!metadata) return false;

  const latitude = metadata.latitude;
  const longitude = metadata.longitude;

  return Number.isFinite(latitude) && Number.isFinite(longitude);
}

const AlertTimelineScreen = ({ navigation, route }) => {
  const { alertId, alertName } = route.params;
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actorNames, setActorNames] = useState({}); // Cache for UID -> Name lookups
  const actorNamesRef = useRef({});

  useEffect(() => {
    actorNamesRef.current = actorNames;
  }, [actorNames]);

  // Fetch actor names mapping
  const fetchActorName = useCallback(async (uid) => {
    if (!uid) return 'Unknown';
    if (actorNamesRef.current[uid]) return actorNamesRef.current[uid];

    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) {
        const name = userDoc.data().fullName || userDoc.data().name || 'User';
        setActorNames((prev) => {
          if (prev[uid]) return prev;
          return { ...prev, [uid]: name };
        });
        return name;
      }
    } catch (err) {
      logger.warn(TAG, 'Failed to fetch actor name:', err);
    }
    return 'User';
  }, []);

  useEffect(() => {
    if (!alertId) {
      setError('Invalid Alert ID');
      setLoading(false);
      return;
    }

    const unsubscribe = subscribeToAlertTimeline(
      alertId,
      async (timelineEvents) => {
        // Pre-fetch names for any new actors
        for (const ev of timelineEvents) {
          if (ev.actorId && !actorNamesRef.current[ev.actorId]) {
            await fetchActorName(ev.actorId);
          }
        }
        setEvents(timelineEvents);
        setLoading(false);
      },
      (err) => {
        logger.error(TAG, 'error:', err);
        setError('Failed to load timeline');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [alertId, fetchActorName]);

  const renderTimelineEvent = ({ item, index }) => {
    const isFirst = index === 0;
    const isLast = index === events.length - 1;

    let icon = 'alert-circle';
    let color = '#6B7280';
    let title = 'Unknown Event';

    switch (item.type) {
      case 'triggered':
        icon = 'alarm-light';
        color = '#EF4444'; // Red
        title = 'SOS Triggered';
        break;
      case 'responded':
        icon = 'shield-account';
        color = '#F59E0B'; // Amber
        title = 'Guardian Responded';
        break;
      case 'resolved':
        icon = 'check-decagram';
        color = '#10B981'; // Green
        title = 'Alert Resolved';
        break;
      case 'alert_cancelled':
        icon = 'close-octagon';
        color = '#6B7280'; // Grey
        title = 'Alert Cancelled';
        break;
    }

    const actorName =
      item.actorId === auth.currentUser?.uid ? 'You' : actorNames[item.actorId] || 'Loading...';

    return (
      <View style={styles.eventRow}>
        {/* Timeline Graphic */}
        <View style={styles.timelineGraphic}>
          <View
            style={[styles.timelineLine, { backgroundColor: isFirst ? 'transparent' : '#E5E7EB' }]}
          />
          <View style={[styles.timelineDot, { backgroundColor: color }]}>
            <MaterialCommunityIcons name={icon} size={14} color="#fff" />
          </View>
          <View
            style={[styles.timelineLine, { backgroundColor: isLast ? 'transparent' : '#E5E7EB' }]}
          />
        </View>

        {/* Event Content */}
        <View style={styles.eventCard}>
          <View style={styles.eventHeader}>
            <Text style={[styles.eventTitle, { color }]}>{title}</Text>
            <Text style={styles.eventTime}>{formatAlertTime(item.timestamp)}</Text>
          </View>
          <View style={styles.eventActorRow}>
            <MaterialCommunityIcons name="account-circle" size={16} color="#6B7280" />
            <Text style={styles.eventActorText}>By {actorName}</Text>
          </View>

          {/* Render extra metadata if available */}
          {hasFiniteCoordinates(item.metadata) && (
            <View style={styles.metadataBadge}>
              <MaterialCommunityIcons name="map-marker" size={12} color="#4F2CF5" />
              <Text style={styles.metadataText}>Location captured</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#111318" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.title}>Incident Timeline</Text>
          <Text style={styles.subtitle}>{alertName}&apos;s Emergency</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4F2CF5" />
          <Text style={styles.loadingText}>Loading timeline...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#EF4444" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => navigation.goBack()}>
            <Text style={styles.retryText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      ) : events.length === 0 ? (
        <View style={styles.centerContainer}>
          <MaterialCommunityIcons name="timeline-alert-outline" size={64} color="#9CA3AF" />
          <Text style={styles.emptyTitle}>No Timeline Events</Text>
          <Text style={styles.emptySubtitle}>We couldn&apos;t find any events for this alert.</Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          renderItem={renderTimelineEvent}
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
    backgroundColor: '#F9FAFB',
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
  headerTitleContainer: {
    alignItems: 'center',
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
  subtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
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
    padding: 20,
    paddingBottom: 40,
  },
  eventRow: {
    flexDirection: 'row',
  },
  timelineGraphic: {
    width: 32,
    alignItems: 'center',
    marginRight: 12,
  },
  timelineLine: {
    flex: 1,
    width: 2,
  },
  timelineDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
  },
  eventCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  eventTime: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  eventActorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  eventActorText: {
    fontSize: 14,
    color: '#4B5057',
    fontWeight: '500',
  },
  metadataBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 10,
    gap: 4,
  },
  metadataText: {
    fontSize: 11,
    color: '#4F2CF5',
    fontWeight: '600',
  },
});

export default AlertTimelineScreen;
