import React, { useRef, useState, useEffect } from 'react';
import { SafeAreaView, ScrollView, View, Text, StyleSheet, TouchableOpacity, Modal, Animated, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import LogoutPopup from './LogoutPopup';
import { signOutUser } from '../services/auth';
import { auth } from '../config/firebase';
import { requestLocationPermission, startLocationTracking, stopLocationTracking, getLocationErrorMessage } from '../services/location';

const Dashboard = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [logoutVisible, setLogoutVisible] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.95)).current;

  // Location tracking state
  const [locationTracking, setLocationTracking] = useState(false);
  const [locationError, setLocationError] = useState(null);
  const [locationSubscription, setLocationSubscription] = useState(null);

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
          console.warn('[Dashboard] Location permission not granted:', permissionResult.status);
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
        console.log('[Dashboard] Location tracking started');
      } catch (error) {
        console.error('[Dashboard] Location tracking initialization error:', error);
        setLocationError({
          message: getLocationErrorMessage(error),
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
        console.log('[Dashboard] Location tracking stopped');
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

  const onHoldVoice = () => {
    // Placeholder: long press action hook
    console.log('Voice trigger pressed');
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Top App Bar */}
      {/* App bar positioned below status bar using safe area inset */}
      <View style={[styles.appBar, { paddingTop: insets.top + 6, height: 56 + insets.top + 6 }]}>
        <View style={styles.appBarLeft}>
          <MaterialCommunityIcons name="shield-outline" size={22} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.brand}>ShieldHer</Text>
        </View>
        <View style={styles.appBarRight}>
          <MaterialCommunityIcons name="bell-outline" size={20} color="#fff" style={{ marginRight: 16 }} />

          {/* Location Tracking Status Indicator */}
          <View style={styles.locationStatusContainer}>
            <View style={[styles.locationStatusDot, locationTracking ? styles.locationActive : styles.locationInactive]} />
            {locationTracking && <ActivityIndicator size="small" color="#31D159" style={{ marginLeft: 2 }} />}
          </View>

          <TouchableOpacity onPress={() => navigation?.push('Profile')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <View style={styles.avatar}><Text style={styles.avatarText}>A</Text></View>
          </TouchableOpacity>
          <TouchableOpacity onPress={openLogout} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.logout}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

  <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
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
        <View style={styles.sosWrap}>
          <View style={styles.sosCircle}>
            <MaterialCommunityIcons name="alert" size={20} color="#fff" style={styles.sosIcon} />
            <Text style={styles.sosText}>SOS</Text>
          </View>
        </View>
        <Text style={styles.warning}>Warning: Initiates contact with Guardians and Local Authorities.</Text>

        {/* Voice trigger button */}
        <TouchableOpacity activeOpacity={0.9} onPress={onHoldVoice} style={styles.voiceBtn}>
          <MaterialCommunityIcons name="microphone" size={18} color="#fff" style={{ marginRight: 10 }} />
          <Text style={styles.voiceText}>Hold to activate voice Trigger</Text>
        </TouchableOpacity>

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

      {/* Logout Modal Overlay */}
      <Modal transparent visible={logoutVisible} animationType="none" onRequestClose={closeLogout}>
        <Animated.View style={[styles.modalBackdrop, { opacity }]}> 
          <Animated.View style={[styles.modalCardWrap, { transform: [{ scale }] }] }>
            <SafeAreaView>
              <LogoutPopup asModal onCancel={closeLogout} onConfirm={async () => { try { await signOutUser(); } catch (e) {} closeLogout(); navigation?.replace?.('Login'); }} />
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
  voiceText: { color: '#fff', fontWeight: '800' },

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

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCardWrap: {
    width: '82%',
  },
});

export default Dashboard;
