import React, { useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Switch,
  ActivityIndicator,
} from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useScreamDetection } from '../hooks/useScreamDetection';
import { auth } from '../config/firebase';
import { checkActiveAlert, dispatchSOSAlert, fetchUserLocation } from '../services/alertService';
import { getCurrentLocation } from '../services/location';
import logger from '../utils/logger';

const TAG = '[Home]';

const Home = ({ navigation }) => {
  const [autoSosEnabled, setAutoSosEnabled] = useState(false);

  const handleGetStarted = () => {
    if (navigation?.navigate) {
      navigation.navigate('Login');
    }
  };

  const [aiTriggerLoading, setAiTriggerLoading] = useState(false);

  const handleScreamDetected = async (data) => {
    try {
      setAiTriggerLoading(true);

      const user = auth.currentUser;
      if (!user) return;

      // Respect cooldown to avoid repeated auto-triggers.
      const hasActiveAlert = await checkActiveAlert(user.uid);
      if (hasActiveAlert) {
        console.log('[Home] Scream trigger ignored: active alert cooldown');
        return;
      }

      // Prefer live device location; fall back to the last Firestore location.
      let location = await getCurrentLocation();
      if (!location) {
        location = await fetchUserLocation(user.uid);
      }

      const result = await dispatchSOSAlert(user.uid, location);
      if (result.success) {
        logger.warn(TAG, 'AI SOS dispatched', {
          method: result.method,
          confidence: data?.confidence ?? null,
          source: data?.source ?? 'unknown',
        });
      } else {
        logger.error(TAG, 'AI SOS failed', {
          error: result.error,
          confidence: data?.confidence ?? null,
        });
      }
    } catch (err) {
      logger.error(TAG, 'SOS trigger failed', err);
    } finally {
      setAiTriggerLoading(false);
    }
  };

  // AI detection pipeline with confidence threshold + multi-frame validation
  const {
    detectionState,
    cooldownState,
    pendingAlert,
    cancelPendingAlert,
    allowPendingCountdown,
  } = useScreamDetection({
    enabled: autoSosEnabled,
    onScreamDetected: handleScreamDetected,
    config: {
      confidenceThreshold: 0.8,
      requiredConsecutiveFrames: 3,
      validationWindowMs: 2000,
      cooldownMs: 60000,
      confirmationCountdownSec: 5,
    },
  });

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Top shield icon */}
        <View style={styles.iconWrap}>
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons name="shield-outline" size={40} color="#ffffff" />
          </View>
        </View>

        {/* Brand title */}
        <Text style={styles.title}>ShieldHer</Text>
        <Text style={styles.subtitle}>
          Safety, Intelligence & <Text style={styles.subtitleAccent}>Empowerment.</Text>
        </Text>

        {/* Welcome card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Welcome to ShieldHer</Text>
          <Text style={styles.cardBody}>
            Your AI-powered personal safety companion. Secure, immediate, and connected protection
            for every woman.
          </Text>
        </View>

        {/* 🚨 Auto SOS Toggle */}
        <View style={styles.toggleContainer}>
          <Text style={styles.toggleText}>AI Auto SOS (Scream Detection)</Text>
          <Switch
            value={autoSosEnabled}
            onValueChange={setAutoSosEnabled}
            trackColor={{ false: '#ccc', true: '#0B26FF' }}
          />
        </View>

        {autoSosEnabled && (
          <View style={styles.aiStatusCard}>
            <View style={styles.aiStatusRow}>
              <Text style={styles.aiStatusLabel}>Detection Status</Text>
              <Text style={styles.aiStatusValue}>
                {detectionState.isListening ? 'Monitoring' : 'Initializing'}
              </Text>
            </View>

            <View style={styles.aiStatusRow}>
              <Text style={styles.aiStatusLabel}>Last Confidence</Text>
              <Text style={styles.aiStatusValue}>
                {Number(detectionState.lastConfidence || 0).toFixed(2)}
              </Text>
            </View>

            <View style={styles.aiStatusRow}>
              <Text style={styles.aiStatusLabel}>Consecutive Frames</Text>
              <Text style={styles.aiStatusValue}>{detectionState.trailingConsecutive || 0}</Text>
            </View>

            {cooldownState.isCoolingDown && (
              <View style={styles.cooldownBanner}>
                <MaterialCommunityIcons name="timer-sand" size={14} color="#1E34FF" />
                <Text style={styles.cooldownText}>
                  Cooldown active: {Math.ceil((cooldownState.remainingMs || 0) / 1000)}s
                </Text>
              </View>
            )}
          </View>
        )}

        {pendingAlert.visible && (
          <View style={styles.aiWarningCard}>
            <View style={styles.aiWarningHeader}>
              <MaterialCommunityIcons name="alert" size={18} color="#B91C1C" />
              <Text style={styles.aiWarningTitle}>Possible distress detected</Text>
            </View>

            <Text style={styles.aiWarningBody}>
              Sending emergency alert in {pendingAlert.countdownSec} seconds.
            </Text>

            <Text style={styles.aiMetaText}>
              Confidence: {Number(pendingAlert.confidence || 0).toFixed(2)}
            </Text>

            {aiTriggerLoading ? (
              <View style={styles.aiLoadingRow}>
                <ActivityIndicator size="small" color="#B91C1C" />
                <Text style={styles.aiLoadingText}>Dispatching emergency alert...</Text>
              </View>
            ) : (
              <View style={styles.aiWarningActions}>
                <TouchableOpacity style={styles.cancelAiButton} onPress={cancelPendingAlert}>
                  <Text style={styles.cancelAiButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.allowAiButton} onPress={allowPendingCountdown}>
                  <Text style={styles.allowAiButtonText}>Allow Countdown</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* CTA button */}
        <TouchableOpacity activeOpacity={0.9} onPress={handleGetStarted} style={styles.cta}>
          <Text style={styles.ctaText}>
            Start Protecting Today <Text style={styles.ctaArrow}>→</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#E9EAEE',
  },

  container: {
    flexGrow: 1,
    backgroundColor: '#E9EAEE',
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },

  iconWrap: {
    marginTop: 8,
    width: '100%',
    alignItems: 'center',
  },

  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F2CF5',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },

  title: {
    marginTop: 18,
    fontSize: 32,
    fontWeight: '800',
    color: '#111318',
  },

  subtitle: {
    marginTop: 6,
    fontSize: 13.5,
    color: '#5B6067',
  },

  subtitleAccent: {
    color: '#1E34FF',
    fontWeight: '700',
  },

  card: {
    marginTop: 28,
    width: '92%',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 18,
    paddingHorizontal: 18,
    elevation: 3,
  },

  cardTitle: {
    textAlign: 'center',
    color: '#0B26FF',
    fontSize: 15,
    fontWeight: '800',
  },

  cardBody: {
    marginTop: 10,
    textAlign: 'center',
    color: '#4B5057',
    fontSize: 13.5,
    lineHeight: 20,
  },

  toggleContainer: {
    marginTop: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '85%',
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    elevation: 2,
  },

  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
  },

  aiStatusCard: {
    marginTop: 14,
    width: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    gap: 8,
    elevation: 2,
  },

  aiStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  aiStatusLabel: {
    fontSize: 12,
    color: '#5B6067',
    fontWeight: '600',
  },

  aiStatusValue: {
    fontSize: 12,
    color: '#111318',
    fontWeight: '800',
  },

  cooldownBanner: {
    marginTop: 2,
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  cooldownText: {
    color: '#1E34FF',
    fontSize: 11,
    fontWeight: '700',
  },

  aiWarningCard: {
    marginTop: 14,
    width: '85%',
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },

  aiWarningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  aiWarningTitle: {
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '800',
  },

  aiWarningBody: {
    marginTop: 8,
    fontSize: 12,
    color: '#7F1D1D',
    fontWeight: '600',
  },

  aiMetaText: {
    marginTop: 4,
    fontSize: 11,
    color: '#7F1D1D',
  },

  aiWarningActions: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },

  cancelAiButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DC2626',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },

  cancelAiButtonText: {
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '800',
  },

  allowAiButton: {
    flex: 1,
    backgroundColor: '#B91C1C',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },

  allowAiButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },

  aiLoadingRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  aiLoadingText: {
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '700',
  },

  cta: {
    marginTop: 40,
    backgroundColor: '#0B26FF',
    paddingVertical: 16,
    paddingHorizontal: 22,
    borderRadius: 28,
    width: '86%',
    alignItems: 'center',
  },

  ctaText: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '800',
  },

  ctaArrow: {
    color: '#FFFFFF',
  },
});

export default Home;
