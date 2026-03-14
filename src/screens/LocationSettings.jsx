import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { auth } from '../config/firebase';
import PrimaryButton from '../components/PrimaryButton';
import { updateUserProfile, getErrorMessage } from '../services/profile';

const LocationSettingsScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();

  const [preferences, setPreferences] = useState({
    enableLocationSharing: false,
    shareWithGuardiansOnly: true,
    allowRealTimeTracking: false,
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
        locationPreferences: preferences,
      });

      setMessage({
        text: 'Location settings saved successfully',
        type: 'success',
      });

      // Auto-navigate back
      setTimeout(() => {
        navigation?.goBack();
      }, 1500);
    } catch (err) {
      console.error('[LocationSettings] handleSave error:', err);
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
        <Text style={styles.headerTitle}>Location Settings</Text>
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
        {/* Main Location Toggle */}
        <View style={styles.section}>
          <SettingToggle
            icon="map-marker"
            label="Enable Location Sharing"
            description="Allow ShieldHer to access your location"
            value={preferences.enableLocationSharing}
            onToggle={() => handleToggle('enableLocationSharing')}
            warning={true}
          />
        </View>

        {/* Conditional Toggles */}
        {preferences.enableLocationSharing && (
          <>
            {/* Share with Guardians Only */}
            <View style={styles.section}>
              <SettingToggle
                icon="account-multiple"
                label="Share with Guardians Only"
                description="Only your linked guardians can see your location"
                value={preferences.shareWithGuardiansOnly}
                onToggle={() => handleToggle('shareWithGuardiansOnly')}
              />
            </View>

            {/* Real-time Tracking */}
            <View style={styles.section}>
              <SettingToggle
                icon="motion-play"
                label="Allow Real-time Tracking"
                description="Guardians can track your live location in real-time"
                value={preferences.allowRealTimeTracking}
                onToggle={() => handleToggle('allowRealTimeTracking')}
                warning={preferences.allowRealTimeTracking}
              />
            </View>
          </>
        )}

        {/* Privacy Notice */}
        <View style={styles.privacyBox}>
          <MaterialCommunityIcons name="shield-lock" size={20} color="#10B981" />
          <Text style={styles.privacyText}>
            Your location data is encrypted and only shared with authorized guardians. You can
            disable location sharing at any time.
          </Text>
        </View>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <MaterialCommunityIcons name="information" size={18} color="#0B26FF" />
          <Text style={styles.infoText}>
            Location sharing helps your guardians ensure your safety and provide support when needed.
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

function SettingToggle({ icon, label, description, value, onToggle, warning = false }) {
  return (
    <View style={[styles.settingRow, warning && value && styles.warningHighlight]}>
      <View style={styles.settingLeft}>
        <MaterialCommunityIcons name={icon} size={24} color="#4F2CF5" />
        <View style={styles.settingText}>
          <Text style={styles.settingLabel}>{label}</Text>
          <Text style={styles.settingDescription}>{description}</Text>
          {warning && value && (
            <View style={styles.warningTag}>
              <MaterialCommunityIcons name="alert" size={12} color="#E01111" />
              <Text style={styles.warningTagText}>Active</Text>
            </View>
          )}
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
  warningHighlight: {
    backgroundColor: '#FEF3F2',
    borderRadius: 8,
    padding: 8,
    marginHorizontal: -8,
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
    marginBottom: 4,
  },
  warningTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#FEE2E2',
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  warningTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#E01111',
  },
  privacyBox: {
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
  },
  privacyText: {
    flex: 1,
    fontSize: 13,
    color: '#15803D',
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

export default LocationSettingsScreen;
