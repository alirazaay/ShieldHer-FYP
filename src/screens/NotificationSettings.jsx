import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { auth } from '../config/firebase';
import PrimaryButton from '../components/PrimaryButton';
import { updateUserProfile, getErrorMessage } from '../services/profile';

const NotificationSettingsScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();

  const [preferences, setPreferences] = useState({
    pushNotifications: true,
    emailAlerts: true,
    guardianAlerts: true,
    emergencyAlertsOnly: false,
  });

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const handleToggle = (key) => {
    setPreferences((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const user = auth.currentUser;

      if (!user) {
        navigation?.replace('Login');
        return;
      }

      // Save preferences to Firestore
      await updateUserProfile(user.uid, {
        notificationPreferences: preferences,
      });

      setMessage({
        text: 'Notification settings saved successfully',
        type: 'success',
      });

      // Auto-navigate back
      setTimeout(() => {
        navigation?.goBack();
      }, 1500);
    } catch (err) {
      console.error('[NotificationSettings] handleSave error:', err);
      setMessage({
        text: getErrorMessage(err),
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation?.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialCommunityIcons name="chevron-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notification Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Message Toast */}
      {message && (
        <View
          style={[
            styles.messageContainer,
            message.type === 'success' ? styles.messageSuccess : styles.messageError,
          ]}
        >
          {message.type === 'success' && (
            <MaterialCommunityIcons
              name="check-circle"
              size={20}
              color="#10B981"
              style={styles.messageIcon}
            />
          )}
          {message.type === 'error' && (
            <MaterialCommunityIcons
              name="alert-circle"
              size={20}
              color="#EF4444"
              style={styles.messageIcon}
            />
          )}
          <Text
            style={[
              styles.messageText,
              message.type === 'success' ? styles.messageTextSuccess : styles.messageTextError,
            ]}
          >
            {message.text}
          </Text>
        </View>
      )}

      {/* Content */}
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Push Notifications */}
        <View style={styles.section}>
          <SettingToggle
            icon="bell"
            label="Push Notifications"
            description="Receive push notifications on your device"
            value={preferences.pushNotifications}
            onToggle={() => handleToggle('pushNotifications')}
          />
        </View>

        {/* Email Alerts */}
        <View style={styles.section}>
          <SettingToggle
            icon="email"
            label="Email Alerts"
            description="Receive email notifications for important updates"
            value={preferences.emailAlerts}
            onToggle={() => handleToggle('emailAlerts')}
          />
        </View>

        {/* Guardian Alerts */}
        <View style={styles.section}>
          <SettingToggle
            icon="account-multiple"
            label="Guardian Alerts"
            description="Notify your guardians of app activities"
            value={preferences.guardianAlerts}
            onToggle={() => handleToggle('guardianAlerts')}
          />
        </View>

        {/* Emergency Alerts Only */}
        <View style={styles.section}>
          <SettingToggle
            icon="alert-circle"
            label="Emergency Alerts Only"
            description="Only receive notifications for emergencies"
            value={preferences.emergencyAlertsOnly}
            onToggle={() => handleToggle('emergencyAlertsOnly')}
          />
        </View>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <MaterialCommunityIcons name="information" size={18} color="#0B26FF" />
          <Text style={styles.infoText}>
            Your notification preferences help us communicate with you effectively while respecting
            your privacy.
          </Text>
        </View>

        {/* Save Button */}
        <View style={styles.buttonContainer}>
          <PrimaryButton
            title={saving ? 'Saving...' : 'Save Settings'}
            onPress={handleSave}
            disabled={saving}
          />
        </View>

        <View style={{ height: insets.bottom + 20 }} />
      </ScrollView>
    </View>
  );
};

function SettingToggle({ icon, label, description, value, onToggle }) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingLeft}>
        <MaterialCommunityIcons name={icon} size={24} color="#4F2CF5" />
        <View style={styles.settingText}>
          <Text style={styles.settingLabel}>{label}</Text>
          <Text style={styles.settingDescription}>{description}</Text>
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: '#E0E0E2', true: '#4F2CF5' }}
        thumbColor={value ? '#fff' : '#fff'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E9EAEE',
  },
  header: {
    backgroundColor: '#4F2CF5',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  messageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  messageSuccess: {
    backgroundColor: '#D1FAE5',
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
  },
  messageError: {
    backgroundColor: '#FEE2E2',
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
  },
  messageIcon: {
    marginRight: 12,
  },
  messageText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  messageTextSuccess: {
    color: '#065F46',
  },
  messageTextError: {
    color: '#991B1B',
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingLeft: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  settingText: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111318',
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 12,
    color: '#9AA0A6',
    fontWeight: '500',
  },
  infoBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#0B26FF',
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#3D3F44',
    fontWeight: '500',
  },
  buttonContainer: {
    paddingHorizontal: 0,
    marginBottom: 16,
  },
});

export default NotificationSettingsScreen;
