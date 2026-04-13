import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { acceptIncomingEmergency, declineIncomingEmergency } from '../services/guardianEmergencyListener';

export default function IncomingSOSCallScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const payload = route?.params?.payload || {};
  const caller = payload?.userName || 'ShieldHer User';

  const onAccept = async () => {
    await acceptIncomingEmergency(payload);
    navigation.replace('UserLocationMap', {
      userId: payload.userId,
      alertId: payload.alertId,
      latitude: payload.latitude,
      longitude: payload.longitude,
    });
  };

  const onDecline = async () => {
    await declineIncomingEmergency(payload);
    navigation.replace('GuardianDashboard');
  };

  return (
    <SafeAreaView style={[styles.safe, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}>
      <View style={styles.content}>
        <MaterialCommunityIcons name="phone-alert" size={72} color="#fff" />
        <Text style={styles.label}>Incoming Emergency Alert</Text>
        <Text style={styles.caller}>{caller}</Text>
        <Text style={styles.meta}>ShieldHer SOS call request</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={[styles.actionButton, styles.decline]} onPress={onDecline}>
          <MaterialCommunityIcons name="phone-hangup" size={22} color="#fff" />
          <Text style={styles.actionText}>Decline</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionButton, styles.accept]} onPress={onAccept}>
          <MaterialCommunityIcons name="phone" size={22} color="#fff" />
          <Text style={styles.actionText}>Accept</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#B80E2A',
    justifyContent: 'space-between',
  },
  content: {
    alignItems: 'center',
    marginTop: 40,
    paddingHorizontal: 24,
  },
  label: {
    marginTop: 24,
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
  },
  caller: {
    marginTop: 10,
    fontSize: 32,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
  },
  meta: {
    marginTop: 12,
    fontSize: 14,
    color: '#FDE2E8',
  },
  actions: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 20,
  },
  actionButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  decline: {
    backgroundColor: '#1F2937',
  },
  accept: {
    backgroundColor: '#059669',
  },
  actionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
});
