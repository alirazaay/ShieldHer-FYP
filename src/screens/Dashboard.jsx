import React, { useState, useEffect, useCallback } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  PermissionsAndroid,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import {
  checkActiveAlert,
  fetchUserLocation,
  dispatchSOSAlert,
  getAlertErrorMessage,
} from '../services/alertService';
import { getSafetyModeState } from '../services/profile';
import { fetchUserDashboardSnapshot } from '../services/dashboardService';
import { startLocationTracking, stopLocationTracking } from '../services/locationListener';
import { useScreamDetection } from '../hooks/useScreamDetection';
import { classifyProb, HARASSMENT_TIERS, logHarassmentEvent } from '../services/harassmentLogger';
import logger from '../utils/logger';

const TAG = '[Dashboard]';

function getUserInitial(profile, firebaseUser) {
  const nameCandidate =
    profile?.fullName || profile?.name || firebaseUser?.displayName || firebaseUser?.email || 'U';
  const initial = String(nameCandidate).trim().charAt(0).toUpperCase();
  return initial || 'U';
}

const Dashboard = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [profileInitial, setProfileInitial] = useState('U');
  const [refreshing, setRefreshing] = useState(false);
  const [dashboardSnapshot, setDashboardSnapshot] = useState({
    guardiansCount: 0,
    primaryContactName: 'No Contact',
    hasPrimaryContact: false,
    hasActiveAlert: false,
    hasLiveLocation: false,
    safetyModeEnabled: false,
  });

  // Location tracking state
  const [locationTracking, setLocationTracking] = useState(false);
  const [isSafetyModeEnabled, setIsSafetyModeEnabled] = useState(false);
  const [locationError, setLocationError] = useState(null);

  // SOS alert state
  const [sosLoading, setSosLoading] = useState(false);
  const [sosError, setSosError] = useState(null);
  const [sosMessage, setSosMessage] = useState(null);
  const [detectionAlert, setDetectionAlert] = useState(null); // { tier, prob }

  // Escalation state – tracks whether current user's alert has been escalated to authorities
  const [escalationState, setEscalationState] = useState(null); // null | 'pending' | 'escalated'

  const loadDashboardSnapshot = useCallback(async ({ isRefresh = false } = {}) => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    try {
      if (isRefresh) {
        setRefreshing(true);
      }

      const snapshot = await fetchUserDashboardSnapshot(currentUser.uid);
      setDashboardSnapshot(snapshot);
      setProfileInitial(snapshot.profileInitial || getUserInitial(null, currentUser));
      return snapshot;
    } catch (error) {
      logger.warn(TAG, 'Failed to load dashboard snapshot:', error);
      setProfileInitial(getUserInitial(null, currentUser));
      return null;
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      }
    }
  }, []);

  // Location tracking initialization against Safety Mode
  useEffect(() => {
    const initializeLocationTracking = async () => {
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) return;

        const snapshot = await loadDashboardSnapshot();
        const isSafetyModeEnabled =
          snapshot?.safetyModeEnabled ?? (await getSafetyModeState(currentUser.uid));

        if (isSafetyModeEnabled) {
          await startLocationTracking(currentUser.uid);
          setLocationTracking(true);
          setIsSafetyModeEnabled(true);
          logger.info(TAG, 'Safety Mode ON: Location tracking started');
        } else {
          stopLocationTracking();
          setLocationTracking(false);
          setIsSafetyModeEnabled(false);
          logger.info(TAG, 'Safety Mode OFF: Location tracking bypassed');
        }
      } catch (error) {
        logger.error(TAG, 'Location tracking initialization error:', error);
        setLocationTracking(false);
      }
    };

    initializeLocationTracking();

    return () => {
      stopLocationTracking();
      setLocationTracking(false);
      setIsSafetyModeEnabled(false);
      logger.info(TAG, 'Dashboard unmounted: Native location and mic monitoring stopped');
    };
  }, [navigation, loadDashboardSnapshot]);

  // ── Escalation listener ────────────────────────────────────────────────
  // Listens to policeAlerts collection for alerts belonging to this user
  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const policeAlertsRef = collection(db, 'policeAlerts');
    const policeQuery = query(
      policeAlertsRef,
      where('userId', '==', currentUser.uid),
      where('status', '==', 'escalated')
    );

    const unsubscribe = onSnapshot(
      policeQuery,
      (snapshot) => {
        if (!snapshot.empty) {
          setEscalationState('escalated');
        } else {
          setEscalationState(null);
        }
      },
      (error) => {
        logger.error(TAG, 'Escalation listener error:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadDashboardSnapshot();
    }, [loadDashboardSnapshot])
  );

  const handleRefreshDashboard = useCallback(async () => {
    await loadDashboardSnapshot({ isRefresh: true });
  }, [loadDashboardSnapshot]);

  // Auto-dismiss location error messages after 4 seconds
  useEffect(() => {
    if (locationError) {
      const timeout = setTimeout(() => setLocationError(null), 4000);
      return () => clearTimeout(timeout);
    }
  }, [locationError]);

  // Auto-dismiss SOS error/success messages after 4 seconds
  useEffect(() => {
    if (sosError || sosMessage) {
      const timeout = setTimeout(() => {
        setSosError(null);
        setSosMessage(null);
      }, 4000);
      return () => clearTimeout(timeout);
    }
  }, [sosError, sosMessage]);

  const triggerSOS = useCallback(
    async ({ reason, prob }) => {
      try {
        setSosLoading(true);
        setSosError(null);

        const currentUser = auth.currentUser;
        if (!currentUser) {
          navigation?.replace('Login');
          return;
        }

        const hasActiveAlert = await checkActiveAlert(currentUser.uid);
        if (hasActiveAlert) {
          setSosError({
            message: 'An alert was recently sent. Please wait before sending another.',
            type: 'warning',
          });
          return;
        }

        const location = await fetchUserLocation(currentUser.uid);
        const dispatchResult = await dispatchSOSAlert(currentUser.uid, location, {
          triggerType: 'AI',
          source: reason,
          confidence: prob,
        });

        if (dispatchResult.success) {
          setSosMessage({
            message: `SOS triggered (${reason}) at ${(Number(prob || 0) * 100).toFixed(0)}% confidence.`,
            type: dispatchResult.deliveryStatus === 'pending_retry' ? 'warning' : 'success',
          });
        } else {
          setSosError({
            message: dispatchResult.error || 'Failed to send alert. Please try again.',
            type: 'error',
          });
        }
      } catch (error) {
        logger.error(TAG, 'Voice-triggered SOS error:', error);
        setSosError({
          message: getAlertErrorMessage(error),
          type: 'error',
        });
      } finally {
        setSosLoading(false);
      }
    },
    [navigation]
  );

  const handleAutoDetect = useCallback(
    async ({ prob }) => {
      const tier = classifyProb(prob);
      if (!tier) return;

      console.log(`[ShieldHer] prob=${Number(prob).toFixed(3)} tier=${tier}`);
      await logHarassmentEvent({ prob, source: 'AUTO', location: null });

      if (tier === 'MILD') {
        logger.info(TAG, 'Mild detection logged silently');
        return;
      }

      if (tier === 'MODERATE') {
        const tierLabel = HARASSMENT_TIERS[tier]?.label || tier;
        setDetectionAlert({ tier, prob });

        Alert.alert(
          `${tierLabel} Distress Detected`,
          `Confidence: ${(Number(prob) * 100).toFixed(0)}%. Do you want to trigger SOS?`,
          [
            {
              text: 'Dismiss',
              style: 'cancel',
              onPress: () => setDetectionAlert(null),
            },
            {
              text: 'Send SOS',
              style: 'destructive',
              onPress: async () => {
                setDetectionAlert(null);
                await triggerSOS({ reason: 'AI_MODERATE', prob });
              },
            },
          ],
          { cancelable: true }
        );
        return;
      }

      setDetectionAlert({ tier, prob });
      logger.warn(TAG, 'HIGH tier detected; auto-triggering SOS');
      await triggerSOS({ reason: 'AI_AUTO_HIGH', prob });
    },
    [triggerSOS]
  );

  const handleManualResult = useCallback(
    async (result) => {
      if (!result?.triggered) {
        Alert.alert('Recording Complete', 'No distress detected in your recording.');
        return;
      }

      const prob = Number(result.maxProb || 0);
      await logHarassmentEvent({ prob, source: 'MANUAL', location: null });

      const tier = classifyProb(prob);
      const tierLabel = HARASSMENT_TIERS[tier]?.label || tier;
      Alert.alert(
        'Distress Detected in Recording',
        `Level: ${tierLabel} (${(prob * 100).toFixed(0)}%). SOS has been triggered.`
      );

      await triggerSOS({ reason: 'MANUAL_HOLD', prob });
    },
    [triggerSOS]
  );

  const {
    isAutoRunning,
    isManualRecording,
    lastProb,
    permissionGranted,
    startAutoDetection,
    stopAutoDetection,
    onHoldStart,
    onHoldEnd,
  } = useScreamDetection({
    onAutoDetect: handleAutoDetect,
    onManualResult: handleManualResult,
  });

  const requestAudioPermission = useCallback(async () => {
    if (Platform.OS !== 'android') return true;

    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Microphone Permission Required',
          message: 'ShieldHer needs microphone access to detect distress sounds and protect you.',
          buttonPositive: 'Grant Permission',
          buttonNegative: 'Cancel',
        }
      );

      if (granted === PermissionsAndroid.RESULTS.GRANTED) {
        console.log('Dashboard: microphone permission granted');
        return true;
      }

      console.log('Dashboard: microphone permission denied');
      Alert.alert(
        'Permission Required',
        'ShieldHer cannot detect distress sounds without microphone access. Please grant permission in Settings.',
        [{ text: 'OK' }]
      );
      return false;
    } catch (err) {
      console.error('Dashboard: permission request error:', err);
      return false;
    }
  }, []);

  const handleStartAIDetection = useCallback(async () => {
    if (isManualRecording) {
      setSosMessage({
        message: 'Finish the manual recording before starting AI detection.',
        type: 'warning',
      });
      return;
    }

    if (isAutoRunning) {
      stopAutoDetection();
      return;
    }

    const hasPermission = await requestAudioPermission();
    if (!hasPermission) return;

    console.log('Dashboard: starting AI detection...');
    await startAutoDetection();
  }, [
    isAutoRunning,
    isManualRecording,
    requestAudioPermission,
    startAutoDetection,
    stopAutoDetection,
  ]);

  const handleVoiceTrigger = useCallback(async () => {
    if (isAutoRunning) {
      setSosMessage({
        message: 'Stop AI detection before starting a manual recording.',
        type: 'warning',
      });
      return false;
    }

    const hasPermission = await requestAudioPermission();
    if (!hasPermission) return false;

    console.log('Dashboard: starting voice trigger...');
    const started = await onHoldStart();
    if (!started) {
      setSosError({
        message: 'Manual recording could not start. Please try again.',
        type: 'warning',
      });
      return false;
    }
    return true;
  }, [isAutoRunning, onHoldStart, requestAudioPermission]);

  const handleSosPress = () => {
    navigation.navigate('SOSCountdownScreen');
  };

  const handleVoicePressIn = useCallback(async () => {
    setSosError(null);
    setSosMessage({
      message: 'Recording your voice sample...',
      type: 'warning',
    });
    await handleVoiceTrigger();
  }, [handleVoiceTrigger]);

  const handleVoicePressOut = useCallback(async () => {
    await onHoldEnd();
  }, [onHoldEnd]);

  const voiceStatus = (() => {
    if (isManualRecording) {
      return 'Recording manual sample...';
    }
    if (isAutoRunning) {
      return 'Auto detection active';
    }
    if (isSafetyModeEnabled) {
      return 'Safety Mode ON';
    }
    return 'Idle';
  })();

  const voiceLastConfidence = lastProb == null ? 'N/A' : Number(lastProb).toFixed(2);
  const voiceLastResult =
    lastProb == null
      ? 'No sample yet'
      : Number(lastProb) >= 0.65
        ? 'Distress detected'
        : 'No distress';

  const statusSummary = (() => {
    if (sosLoading || dashboardSnapshot.hasActiveAlert || escalationState === 'escalated') {
      return {
        label: 'ALERT',
        score: '20%',
        note: 'Status: EMERGENCY',
        style: styles.badgeDanger,
      };
    }

    if (isAutoRunning) {
      return {
        label: 'WATCH',
        score: '86%',
        note: 'Status: MONITORING',
        style: styles.badgeWatch,
      };
    }

    if (isSafetyModeEnabled && locationTracking) {
      return {
        label: 'SAFE',
        score: '100%',
        note: 'Status: SECURE',
        style: styles.badgeSafe,
      };
    }

    if (isSafetyModeEnabled) {
      return {
        label: 'READY',
        score: '88%',
        note: 'Status: ARMED',
        style: styles.badgeWatch,
      };
    }

    return {
      label: 'CHECK',
      score: '62%',
      note: 'Status: REVIEW SETTINGS',
      style: styles.badgeMuted,
    };
  })();

  const primaryContactBadge = dashboardSnapshot.hasPrimaryContact
    ? String(dashboardSnapshot.primaryContactName || 'CONTACT')
        .split(' ')[0]
        .toUpperCase()
        .slice(0, 8)
    : 'N/A';

  const primaryContactStatus = dashboardSnapshot.hasPrimaryContact
    ? dashboardSnapshot.hasLiveLocation
      ? 'Status: Live location synced'
      : 'Status: Linked'
    : 'Status: Add a guardian in profile';

  return (
    <SafeAreaView style={styles.safe}>
      {/* Top App Bar */}
      {/* App bar positioned below status bar using safe area inset */}
      <View style={[styles.appBar, { paddingTop: insets.top + 6, height: 56 + insets.top + 6 }]}>
        <View style={styles.appBarLeft}>
          <MaterialCommunityIcons
            name="shield-outline"
            size={22}
            color="#fff"
            style={{ marginRight: 8 }}
          />
          <Text style={styles.brand}>ShieldHer</Text>
        </View>
        <View style={styles.appBarRight}>
          {/* Location Tracking Status Indicator */}
          <View style={styles.locationStatusContainer}>
            <View
              style={[
                styles.locationStatusDot,
                locationTracking ? styles.locationActive : styles.locationInactive,
              ]}
            />
            {locationTracking && (
              <ActivityIndicator size="small" color="#31D159" style={{ marginLeft: 2 }} />
            )}
          </View>

          <TouchableOpacity
            onPress={() => navigation?.push('Profile')}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{profileInitial}</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefreshDashboard}
            colors={['#4F2CF5']}
            tintColor="#4F2CF5"
          />
        }
      >
        {/* SOS Error/Success Toast */}
        {(sosError || sosMessage) && (
          <View
            style={[
              styles.errorToast,
              sosError
                ? sosError.type === 'error'
                  ? styles.errorToastError
                  : styles.errorToastWarning
                : styles.errorToastSuccess,
            ]}
          >
            <MaterialCommunityIcons
              name={
                sosMessage
                  ? sosMessage.type === 'warning'
                    ? 'timer-sand'
                    : 'check-circle'
                  : sosError?.type === 'error'
                    ? 'alert-circle'
                    : 'information'
              }
              size={16}
              color={
                sosMessage
                  ? sosMessage.type === 'warning'
                    ? '#F59E0B'
                    : '#10B981'
                  : sosError?.type === 'error'
                    ? '#EF4444'
                    : '#F59E0B'
              }
            />
            <Text
              style={[
                styles.errorToastText,
                {
                  color: sosMessage
                    ? sosMessage.type === 'warning'
                      ? '#F59E0B'
                      : '#10B981'
                    : sosError?.type === 'error'
                      ? '#EF4444'
                      : '#F59E0B',
                },
              ]}
            >
              {sosMessage?.message || sosError?.message}
            </Text>
          </View>
        )}

        {/* Location Error Toast */}
        {locationError && (
          <View
            style={[
              styles.errorToast,
              locationError.type === 'error' ? styles.errorToastError : styles.errorToastWarning,
            ]}
          >
            <MaterialCommunityIcons
              name={locationError.type === 'error' ? 'alert-circle' : 'information'}
              size={16}
              color={locationError.type === 'error' ? '#EF4444' : '#F59E0B'}
            />
            <Text
              style={[
                styles.errorToastText,
                { color: locationError.type === 'error' ? '#EF4444' : '#F59E0B' },
              ]}
            >
              {locationError.message}
            </Text>
          </View>
        )}

        <View style={styles.overviewBanner}>
          <View style={styles.overviewItem}>
            <Text style={styles.overviewLabel}>Guardians Linked</Text>
            <Text style={styles.overviewValue}>{dashboardSnapshot.guardiansCount}</Text>
          </View>
          <View style={styles.overviewDivider} />
          <View style={styles.overviewItem}>
            <Text style={styles.overviewLabel}>Primary Contact</Text>
            <Text style={styles.overviewValue} numberOfLines={1}>
              {dashboardSnapshot.primaryContactName}
            </Text>
          </View>
        </View>

        {/* Emergency Protocol */}
        <Text style={styles.sectionTitle}>Emergency Protocol</Text>

        {/* SOS big circle */}
        <TouchableOpacity
          onPress={handleSosPress}
          disabled={sosLoading}
          style={styles.sosWrap}
          activeOpacity={0.8}
        >
          <View style={[styles.sosCircle, sosLoading && styles.sosCircleLoading]}>
            {sosLoading ? (
              <ActivityIndicator size="large" color="#fff" />
            ) : (
              <>
                <MaterialCommunityIcons
                  name="alert"
                  size={20}
                  color="#fff"
                  style={styles.sosIcon}
                />
                <Text style={styles.sosText}>SOS</Text>
              </>
            )}
          </View>
        </TouchableOpacity>
        <Text style={styles.warning}>
          Warning: Initiates contact with Guardians and Local Authorities.
        </Text>

        {/* Escalation Status Banner */}
        {escalationState === 'escalated' && (
          <View style={styles.escalationBanner}>
            <MaterialCommunityIcons name="police-badge" size={20} color="#fff" />
            <View style={styles.escalationTextWrap}>
              <Text style={styles.escalationTitle}>Authorities Notified</Text>
              <Text style={styles.escalationSub}>Alert escalated to local authorities</Text>
            </View>
          </View>
        )}

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={handleStartAIDetection}
          disabled={sosLoading}
          style={[styles.voiceBtn, sosLoading && styles.voiceBtnDisabled]}
        >
          <MaterialCommunityIcons
            name={isAutoRunning ? 'ear-hearing' : 'ear-hearing-off'}
            size={18}
            color="#fff"
            style={{ marginRight: 10 }}
          />
          <View style={styles.voiceTextWrap}>
            <Text style={styles.voiceText}>
              {isAutoRunning ? 'Stop AI Detection' : 'Start AI Detection'}
            </Text>
            <Text style={styles.voiceSubText}>Calibration threshold: 0.0030</Text>
          </View>
        </TouchableOpacity>

        {/* Manual hold-to-record button */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPressIn={handleVoicePressIn}
          onPressOut={handleVoicePressOut}
          disabled={sosLoading}
          style={[styles.voiceBtn, sosLoading && styles.voiceBtnDisabled]}
        >
          <MaterialCommunityIcons
            name={isManualRecording ? 'microphone' : 'microphone-outline'}
            size={18}
            color="#fff"
            style={{ marginRight: 10 }}
          />
          <View style={styles.voiceTextWrap}>
            <Text style={styles.voiceText}>
              {isManualRecording ? 'Recording... Release to Analyse' : 'Hold to Record Voice'}
            </Text>
            {isAutoRunning && (
              <Text style={styles.voiceSubText}>Stop AI detection to use manual recording</Text>
            )}
          </View>
        </TouchableOpacity>

        <View style={styles.voiceHealthCard}>
          <View style={styles.voiceHealthRow}>
            <MaterialCommunityIcons name="waveform" size={14} color="#3A2BF1" />
            <Text style={styles.voiceHealthLabel}>Voice Detection</Text>
            <Text style={styles.voiceHealthValue}>{voiceStatus}</Text>
          </View>
          <View style={styles.voiceHealthRowMuted}>
            <Text style={styles.voiceHealthMuted}>Last result: {voiceLastResult}</Text>
            <Text style={styles.voiceHealthMuted}>Confidence: {voiceLastConfidence}</Text>
          </View>
          <View style={styles.voiceHealthRowMuted}>
            <Text style={styles.voiceHealthMuted}>
              Mic permission: {permissionGranted ? 'Granted' : 'Not granted'}
            </Text>
            <Text style={styles.voiceHealthMuted}>
              Alert state: {detectionAlert?.tier || 'None'}
            </Text>
          </View>
        </View>

        {/* Status Row */}
        <View style={styles.statusRow}>
          <View style={styles.statusCol}>
            <Text style={styles.statusHeading}>Current Status Rating</Text>
            <View style={styles.badgeCircle}>
              <Text style={statusSummary.style}>{statusSummary.label}</Text>
              <Text style={styles.badgePct}>{statusSummary.score}</Text>
            </View>
            <Text style={styles.statusNote}>{statusSummary.note}</Text>
          </View>
          <View style={styles.statusCol}>
            <Text style={[styles.statusHeading, styles.linkHeading]}>Primary Contact Online</Text>
            <View style={styles.badgeCircle}>
              <Text style={styles.badgeText}>{primaryContactBadge}</Text>
            </View>
            <Text style={styles.statusNote}>{primaryContactStatus}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#E0E0E2' },
  appBar: {
    backgroundColor: '#4F2CF5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  appBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brand: { color: '#fff', fontSize: 18, fontWeight: '800' },
  appBarRight: { flexDirection: 'row', alignItems: 'center' },
  locationStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  locationStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  locationActive: {
    backgroundColor: '#31D159',
  },
  locationInactive: {
    backgroundColor: '#EF4444',
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#0B26FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 12 },

  errorToast: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 12,
    marginVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  errorToastError: {
    backgroundColor: '#FEE2E2',
    borderLeftWidth: 3,
    borderLeftColor: '#EF4444',
  },
  errorToastWarning: {
    backgroundColor: '#FEF3C7',
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  errorToastSuccess: {
    backgroundColor: '#D1FAE5',
    borderLeftWidth: 3,
    borderLeftColor: '#10B981',
  },
  errorToastText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
  },

  overviewBanner: {
    width: '88%',
    marginTop: 12,
    backgroundColor: '#EEF2FF',
    borderColor: '#D9E1FF',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  overviewItem: {
    flex: 1,
  },
  overviewDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#CBD5FF',
    marginHorizontal: 10,
  },
  overviewLabel: {
    fontSize: 11,
    color: '#535964',
    marginBottom: 2,
  },
  overviewValue: {
    fontSize: 13,
    color: '#1F2451',
    fontWeight: '800',
  },

  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    backgroundColor: '#E0E0E2',
  },
  sectionTitle: {
    marginTop: 14,
    fontWeight: '900',
    color: '#2D2F33',
    fontSize: 16,
  },
  sosWrap: { marginTop: 18, alignItems: 'center', width: '100%' },
  sosCircle: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#E01111',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  sosCircleLoading: {
    opacity: 0.8,
  },
  sosIcon: { position: 'absolute', top: 16 },
  sosText: { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: 1 },
  warning: {
    marginTop: 10,
    color: '#3E4046',
    fontSize: 10,
    textAlign: 'center',
    width: '86%',
  },
  voiceBtn: {
    marginTop: 16,
    backgroundColor: '#3A2BF1',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  voiceBtnDisabled: {
    opacity: 0.7,
  },
  voiceTextWrap: {
    flex: 1,
  },
  voiceText: { color: '#fff', fontWeight: '800' },
  voiceSubText: { color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 2 },
  voiceHealthCard: {
    marginTop: 10,
    width: '88%',
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#D9E1FF',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  voiceHealthRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  voiceHealthLabel: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '700',
    color: '#2A2D34',
    flex: 1,
  },
  voiceHealthValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3A2BF1',
  },
  voiceHealthRowMuted: {
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  voiceHealthMuted: {
    fontSize: 11,
    color: '#535964',
  },

  statusRow: {
    marginTop: 28,
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '88%',
  },
  statusCol: { width: '48%', alignItems: 'center' },
  statusHeading: { fontSize: 12, color: '#2D2F33', marginBottom: 10 },
  linkHeading: { color: '#1E34FF', textDecorationLine: 'underline' },
  badgeCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#3A2BF1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  badgeSafe: { color: '#31D159', fontWeight: '900', fontSize: 18, marginBottom: 6 },
  badgeWatch: { color: '#FACC15', fontWeight: '900', fontSize: 18, marginBottom: 6 },
  badgeDanger: { color: '#FCA5A5', fontWeight: '900', fontSize: 18, marginBottom: 6 },
  badgeMuted: { color: '#D1D5DB', fontWeight: '900', fontSize: 18, marginBottom: 6 },
  badgePct: { color: '#fff', fontWeight: '900', fontSize: 16 },
  badgeText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  statusNote: { color: '#2D2F33', fontSize: 11 },

  escalationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DC2626',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginTop: 16,
    width: '88%',
    gap: 12,
  },
  escalationTextWrap: {
    flex: 1,
  },
  escalationTitle: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 14,
  },
  escalationSub: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    marginTop: 2,
  },
});

export default Dashboard;
