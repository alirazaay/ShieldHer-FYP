import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth } from '../config/firebase';
import { cancelAlert, getAlertLifecycleErrorMessage } from '../services/alertLifecycleService';

const AlertActiveScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState(null);

  const alertId = route?.params?.alertId || null;
  const deliveryStatus = route?.params?.deliveryStatus || 'sent';
  const statusMessage = route?.params?.statusMessage || 'Emergency alert sent';

  const statusStyle =
    deliveryStatus === 'pending_retry'
      ? styles.deliveryInfoWarning
      : deliveryStatus === 'sms_backup_prepared'
        ? styles.deliveryInfoNeutral
        : styles.deliveryInfoSuccess;

  const handleCancelEmergency = () => {
    if (!alertId) {
      setCancelError('This alert cannot be cancelled from the app.');
      return;
    }

    Alert.alert(
      'Cancel Emergency Alert',
      'Are you safe? Cancelling will notify your guardians.',
      [
        { text: 'Keep Alert Active', style: 'cancel' },
        {
          text: 'Cancel Emergency',
          style: 'destructive',
          onPress: async () => {
            try {
              const currentUser = auth.currentUser;
              if (!currentUser) {
                navigation.replace('Login');
                return;
              }

              setCancelError(null);
              setIsCancelling(true);
              await cancelAlert(alertId, currentUser.uid);

              Alert.alert(
                'Emergency Cancelled',
                'Your guardians have been notified that the alert was cancelled.',
                [{ text: 'OK', onPress: () => navigation.navigate('Dashboard') }]
              );
            } catch (error) {
              setCancelError(getAlertLifecycleErrorMessage(error));
            } finally {
              setIsCancelling(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <MaterialCommunityIcons name="broadcast" size={80} color="#fff" />
        </View>
        <Text style={styles.title}>SOS ACTIVE</Text>
        <Text style={styles.subtitle}>Your emergency signal is being delivered.</Text>
        <View style={[styles.deliveryInfoCard, statusStyle]}>
          <Text style={styles.deliveryInfoText}>{statusMessage}</Text>
        </View>
        {deliveryStatus === 'pending_retry' ? (
          <Text style={styles.retryHint}>Offline backup message prepared</Text>
        ) : null}
        {cancelError ? <Text style={styles.errorText}>{cancelError}</Text> : null}
      </View>

      <View style={styles.footerButtons}>
        <TouchableOpacity
          style={[styles.cancelButton, isCancelling && styles.disabledButton]}
          onPress={handleCancelEmergency}
          disabled={isCancelling}
        >
          {isCancelling ? (
            <ActivityIndicator size="small" color="#E01111" />
          ) : (
            <Text style={styles.cancelButtonText}>Cancel Emergency</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.returnButton, isCancelling && styles.disabledButton]}
          onPress={() => navigation.navigate('Dashboard')}
          disabled={isCancelling}
        >
          <Text style={styles.returnButtonText}>Return to Dashboard</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E01111',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 40,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  iconContainer: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 36,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 16,
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 18,
    color: '#fff',
    textAlign: 'center',
    lineHeight: 26,
    opacity: 0.9,
  },
  deliveryInfoCard: {
    marginTop: 16,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  deliveryInfoSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
  },
  deliveryInfoWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.25)',
  },
  deliveryInfoNeutral: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  deliveryInfoText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  retryHint: {
    marginTop: 8,
    color: '#fff',
    fontSize: 12,
    opacity: 0.9,
    textAlign: 'center',
  },
  errorText: {
    marginTop: 16,
    color: '#fff',
    fontSize: 13,
    textAlign: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  footerButtons: {
    width: '100%',
    alignItems: 'center',
    gap: 12,
  },
  cancelButton: {
    backgroundColor: '#fff',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 30,
    minWidth: 260,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#E01111',
    fontSize: 16,
    fontWeight: 'bold',
  },
  returnButton: {
    backgroundColor: '#fff',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 30,
    minWidth: 260,
    alignItems: 'center',
  },
  returnButtonText: {
    color: '#E01111',
    fontSize: 16,
    fontWeight: 'bold',
  },
  disabledButton: {
    opacity: 0.7,
  },
});

export default AlertActiveScreen;
