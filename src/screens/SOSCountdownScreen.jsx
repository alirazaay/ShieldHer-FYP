import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { auth } from '../config/firebase';
import {
  checkActiveAlert,
  fetchUserLocation,
  dispatchSOSAlert,
  getAlertErrorMessage,
} from '../services/alertService';

const SOSCountdownScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [countdown, setCountdown] = useState(10);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    // Small vibration to alert the user the countdown has started
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    // Start countdown timer
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0; // Trigger alert at 0
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Trigger alert when countdown hits 0
  useEffect(() => {
    if (countdown === 0) {
      triggerSOS();
    }
  }, [countdown]);

  const triggerSOS = async () => {
    try {
      setIsProcessing(true);
      setErrorMsg(null);

      const currentUser = auth.currentUser;
      if (!currentUser) {
        navigation.replace('Login');
        return;
      }

      // Check for active alert within cooldown
      const hasActiveAlert = await checkActiveAlert(currentUser.uid);
      if (hasActiveAlert) {
        setErrorMsg('An alert was recently sent. Please wait before sending another.');
        setIsProcessing(false);
        return;
      }

      // Fetch user's current location
      const location = await fetchUserLocation(currentUser.uid);

      // Dispatch SOS alert (handles online Firestore + offline SMS fallback)
      const result = await dispatchSOSAlert(currentUser.uid, location);

      if (result.success) {
        // Success – Navigate to active alert screen
        // Note: For SMS-only alerts, the screen may show different info
        navigation.replace('AlertActiveScreen', {
          alertId: result.alertId,
          method: result.method, // 'firestore' or 'sms'
        });
      } else {
        // Both Firestore and SMS failed
        setErrorMsg(result.error || 'Failed to send alert. Please try again.');
        setIsProcessing(false);
      }
    } catch (error) {
      console.error('[SOSCountdown] Alert error:', error);
      setErrorMsg(getAlertErrorMessage(error));
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    // If the timer is still going, the component unmount will clear the interval
    // Navigate back to the previous screen (Dashboard)
    navigation.goBack();
  };

  return (
    <SafeAreaView style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="alert-octagon" size={48} color="#E01111" />
        <Text style={styles.alertTitle}>EMERGENCY PROTOCOL</Text>
      </View>

      <View style={styles.mainContent}>
        {isProcessing ? (
          <View style={styles.processingContainer}>
            <ActivityIndicator size="large" color="#E01111" />
            <Text style={styles.processingText}>Transmitting SOS Signal...</Text>
          </View>
        ) : (
          <>
            <View style={styles.countdownContainer}>
              <Text style={styles.countdownText}>{countdown}</Text>
            </View>
            <Text style={styles.warningText}>SOS will be sent in {countdown} seconds</Text>

            {errorMsg && (
              <View style={styles.errorContainer}>
                <MaterialCommunityIcons name="alert-circle" size={20} color="#EF4444" />
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            )}
          </>
        )}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={handleCancel}
          disabled={isProcessing}
        >
          <Text style={styles.cancelButtonText}>CANCEL</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111318', // Dark background for critical screens
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'center',
    marginTop: 40,
  },
  alertTitle: {
    color: '#E01111',
    fontSize: 24,
    fontWeight: '900',
    marginTop: 10,
    letterSpacing: 2,
  },
  mainContent: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  countdownContainer: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 10,
    borderColor: '#E01111',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
    backgroundColor: 'rgba(224, 17, 17, 0.1)',
  },
  countdownText: {
    fontSize: 96,
    fontWeight: 'bold',
    color: '#fff',
  },
  warningText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  processingContainer: {
    alignItems: 'center',
  },
  processingText: {
    color: '#fff',
    fontSize: 18,
    marginTop: 20,
    fontWeight: '600',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 8,
    marginTop: 20,
    marginHorizontal: 20,
  },
  errorText: {
    color: '#EF4444',
    marginLeft: 8,
    fontWeight: '500',
    flex: 1,
  },
  footer: {
    width: '100%',
    paddingHorizontal: 30,
  },
  cancelButton: {
    backgroundColor: '#E01111',
    width: '100%',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
});

export default SOSCountdownScreen;
