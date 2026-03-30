import React, { useRef, useState, useEffect } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import LogoutPopup from './LogoutPopup';
import { signOutUser } from '../services/auth';
import { auth, db } from '../config/firebase';
import {
  checkActiveAlert,
  fetchUserLocation,
  dispatchSOSAlert,
  getAlertErrorMessage,
} from '../services/alertService';
import { getSafetyModeState } from '../services/profile';
import { startLocationTracking, stopLocationTracking } from '../services/locationListener';
import { useScreamDetection } from '../hooks/useScreamDetection';
import logger from '../utils/logger';

const TAG = '[Dashboard]';

const Dashboard = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [logoutVisible, setLogoutVisible] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.95)).current;

  // Location tracking state
  const [locationTracking, setLocationTracking] = useState(false);
  const [isSafetyModeEnabled, setIsSafetyModeEnabled] = useState(false);
  const [locationError, setLocationError] = useState(null);

  // SOS alert state
  const [sosLoading, setSosLoading] = useState(false);
  const [sosError, setSosError] = useState(null);
  const [sosMessage, setSosMessage] = useState(null);
  const [confirmSosVisible, setConfirmSosVisible] = useState(false);

  // Escalation state – tracks whether current user's alert has been escalated to authorities
  const [escalationState, setEscalationState] = useState(null); // null | 'pending' | 'escalated'

  // Location tracking initialization against Safety Mode
  useEffect(() => {
    const initializeLocationTracking = async () => {
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) return;

        // Check Safety Mode status inside Firestore
        const isSafetyModeEnabled = await getSafetyModeState(currentUser.uid);

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
  }, [navigation]);

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

  const triggerSosFromScream = async (analysis, source = 'manual') => {
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
      const dispatchResult = await dispatchSOSAlert(currentUser.uid, location);

      if (dispatchResult.success) {
        const confidenceText = Number(analysis?.confidence || 0).toFixed(2);
        setSosMessage({
          message: `Scream detected (${confidenceText}) - SOS triggered via ${source}.`,
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
  };

  const {
    startListening,
    stopListening,
    isListening: isVoiceListening,
    isAnalyzing: isVoiceAnalyzing,
    result: voiceResult,
    cooldownState: voiceCooldownState,
    error: voiceDetectionError,
  } = useScreamDetection({
    enabled: isSafetyModeEnabled,
    continuous: isSafetyModeEnabled,
    config: {
      confidenceThreshold: 0.75,
      intervalMs: 2000,
      cooldownMs: 60000,
    },
    onScreamDetected: async (analysis) => {
      await triggerSosFromScream(analysis, 'auto');
    },
  });

  useEffect(() => {
    if (!voiceDetectionError) return;

    setSosError({
      message: voiceDetectionError.message || 'Voice detection failed',
      type: 'error',
    });
  }, [voiceDetectionError]);

  const openLogout = () => {
    setLogoutVisible(true);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 7, tension: 80 }),
    ]).start();
  };

  const closeLogout = () => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 0.95, duration: 120, useNativeDriver: true }),
    ]).start(() => setLogoutVisible(false));
  };

  const handleSosConfirm = async () => {
    try {
      setSosLoading(true);
      setConfirmSosVisible(false);
      setSosError(null);
      setSosMessage(null);

      const currentUser = auth.currentUser;
      if (!currentUser) {
        navigation?.replace('Login');
        return;
      }

      // Check for active alert within cooldown
      const hasActiveAlert = await checkActiveAlert(currentUser.uid);
      if (hasActiveAlert) {
        setSosError({
          message: 'An alert was recently sent. Please wait before sending another.',
          type: 'warning',
        });
        logger.info(TAG, 'SOS alert blocked by cooldown');
        return;
      }

      // Fetch user's current location
      const location = await fetchUserLocation(currentUser.uid);

      const result = await dispatchSOSAlert(currentUser.uid, location);

      if (result.success) {
        setSosMessage({
          message: result.statusMessage || 'Emergency alert sent',
          type: result.deliveryStatus === 'pending_retry' ? 'warning' : 'success',
        });
        logger.info(TAG, 'SOS dispatch result:', result.method, result.alertId);
      } else {
        setSosError({
          message: result.error || 'Failed to send alert. Please try again.',
          type: 'error',
        });
      }
    } catch (error) {
      logger.error(TAG, 'SOS alert error:', error);
      setSosError({
        message: getAlertErrorMessage(error),
        type: 'error',
      });
    } finally {
      setSosLoading(false);
    }
  };

  const handleSosPress = () => {
    navigation.navigate('SOSCountdownScreen');
  };

  const handleVoicePressIn = async () => {
    setSosError(null);
    setSosMessage({
      message: 'Listening for distress...',
      type: 'warning',
    });
    await startListening();
  };

  const handleVoicePressOut = async () => {
    const analysis = await stopListening();
    if (!analysis) return;

    if (analysis.isScream || Number(analysis.confidence || 0) > 0.75) {
      await triggerSosFromScream(analysis, 'manual');
      return;
    }

    setSosMessage({
      message: 'No threat detected',
      type: 'success',
    });
  };

  const voiceStatus = (() => {
    if (voiceCooldownState?.isCoolingDown) {
      return `Cooldown ${Math.ceil((voiceCooldownState.remainingMs || 0) / 1000)}s`;
    }
    if (isVoiceAnalyzing) {
      return 'Analyzing audio...';
    }
    if (isVoiceListening) {
      return 'Listening...';
    }
    if (isSafetyModeEnabled) {
      return 'Armed (auto scan every 2s)';
    }
    return 'Idle';
  })();

  const voiceLastConfidence = Number(voiceResult?.confidence || 0).toFixed(2);
  const voiceLastResult = voiceResult
    ? voiceResult.isScream || Number(voiceResult.confidence || 0) > 0.75
      ? 'Scream detected'
      : 'No threat'
    : 'No sample yet';

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
          <MaterialCommunityIcons
            name="bell-outline"
            size={20}
            color="#fff"
            style={{ marginRight: 16 }}
          />

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
              <Text style={styles.avatarText}>A</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={openLogout}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.logout}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
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

        {/* Voice trigger button */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPressIn={handleVoicePressIn}
          onPressOut={handleVoicePressOut}
          disabled={sosLoading}
          style={[styles.voiceBtn, sosLoading && styles.voiceBtnDisabled]}
        >
          <MaterialCommunityIcons
            name={isVoiceListening ? 'microphone' : 'microphone-outline'}
            size={18}
            color="#fff"
            style={{ marginRight: 10 }}
          />
          <View style={styles.voiceTextWrap}>
            <Text style={styles.voiceText}>
              {isVoiceListening ? 'Listening...' : 'Hold To Activate Voice Trigger'}
            </Text>
            {isSafetyModeEnabled && <Text style={styles.voiceSubText}>Auto mode is running</Text>}
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
        </View>

        {/* Status Row */}
        <View style={styles.statusRow}>
          <View style={styles.statusCol}>
            <Text style={styles.statusHeading}>Current Status Rating</Text>
            <View style={styles.badgeCircle}>
              <Text style={styles.badgeSafe}>SAFE</Text>
              <Text style={styles.badgePct}>100%</Text>
            </View>
            <Text style={styles.statusNote}>Status **SECURE**</Text>
          </View>
          <View style={styles.statusCol}>
            <Text style={[styles.statusHeading, styles.linkHeading]}>Primary Contact Online</Text>
            <View style={styles.badgeCircle}>
              <Text style={styles.badgeText}>MOM</Text>
            </View>
            <Text style={styles.statusNote}>Status **Active**</Text>
          </View>
        </View>
      </ScrollView>

      {/* SOS Confirmation Modal */}
      <Modal
        transparent
        visible={confirmSosVisible}
        animationType="fade"
        onRequestClose={() => setConfirmSosVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.confirmationDialog}>
            <MaterialCommunityIcons
              name="alert"
              size={48}
              color="#E01111"
              style={{ marginBottom: 16 }}
            />
            <Text style={styles.confirmTitle}>Emergency Alert</Text>
            <Text style={styles.confirmMessage}>
              Send SOS alert to your guardians and local authorities?
            </Text>
            <Text style={styles.confirmWarning}>
              Your location and contact details will be shared.
            </Text>
            <View style={styles.confirmButtonGroup}>
              <TouchableOpacity
                onPress={() => setConfirmSosVisible(false)}
                style={[styles.confirmButton, styles.confirmButtonCancel]}
                disabled={sosLoading}
              >
                <Text style={[styles.confirmButtonText, styles.confirmButtonTextCancel]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSosConfirm}
                style={[styles.confirmButton, styles.confirmButtonConfirm]}
                disabled={sosLoading}
              >
                {sosLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.confirmButtonText}>Send Alert</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Logout Modal Overlay */}
      <Modal transparent visible={logoutVisible} animationType="none" onRequestClose={closeLogout}>
        <Animated.View style={[styles.modalBackdrop, { opacity }]}>
          <Animated.View style={[styles.modalCardWrap, { transform: [{ scale }] }]}>
            <SafeAreaView>
              <LogoutPopup
                asModal
                onCancel={closeLogout}
                onConfirm={async () => {
                  try {
                    await signOutUser();
                  } catch (e) {
                    logger.error(TAG, 'Logout failed:', e);
                  }
                  closeLogout();
                  navigation?.replace?.('Login');
                }}
              />
            </SafeAreaView>
          </Animated.View>
        </Animated.View>
      </Modal>
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
  logout: { color: '#fff', fontWeight: '800' },

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

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  confirmationDialog: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  confirmTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111318',
    marginBottom: 8,
  },
  confirmMessage: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3E4046',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 20,
  },
  confirmWarning: {
    fontSize: 12,
    fontWeight: '500',
    color: '#9AA0A6',
    textAlign: 'center',
    marginBottom: 24,
    fontStyle: 'italic',
  },
  confirmButtonGroup: {
    width: '100%',
    gap: 12,
  },
  confirmButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonCancel: {
    backgroundColor: '#F3F4F6',
  },
  confirmButtonConfirm: {
    backgroundColor: '#E01111',
  },
  confirmButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  confirmButtonTextCancel: {
    color: '#111318',
  },

  modalCardWrap: {
    width: '82%',
  },
});

export default Dashboard;
