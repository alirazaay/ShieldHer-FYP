import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { auth } from '../config/firebase';
import PrimaryButton from '../components/PrimaryButton';
import {
  updateUserProfile,
  getSafetyModeState,
  toggleSafetyMode,
  getVoiceSOSState,
  toggleVoiceSOS,
  getErrorMessage,
} from '../services/profile';
import { requestLocationPermission } from '../services/location';
import { startLocationTracking, stopLocationTracking } from '../services/locationListener';
import logger from '../utils/logger';

const TAG = '[LocationSettings]';

const LocationSettingsScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();

  const [preferences, setPreferences] = useState({
    enableLocationSharing: false,
    shareWithGuardiansOnly: true,
    allowRealTimeTracking: false,
  });

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const [safetyMode, setSafetyMode] = useState(false);
  const [safetyModeLoading, setSafetyModeLoading] = useState(true);

  const [voiceSOSMode, setVoiceSOSMode] = useState(false);
  const [voiceSOSLoading, setVoiceSOSLoading] = useState(true);

  // Load Safety Mode on mount
  React.useEffect(() => {
    const initSafety = async () => {
      const user = auth.currentUser;
      if (user) {
        const smState = await getSafetyModeState(user.uid);
        const voiceState = await getVoiceSOSState(user.uid);
        setSafetyMode(smState);
        setVoiceSOSMode(voiceState);
      }
      setSafetyModeLoading(false);
      setVoiceSOSLoading(false);
    };
    initSafety();
  }, []);

  const handleSafetyModeToggle = async (newValue) => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      setSafetyModeLoading(true);

      if (newValue) {
        // Turning ON
        const permResult = await requestLocationPermission();
        if (!permResult.granted) {
          Alert.alert(
            'Permission Denied',
            'Location permission is required to enable Safety Mode.'
          );
          setSafetyMode(false);
        } else {
          await toggleSafetyMode(user.uid, true);
          await startLocationTracking(user.uid);
          setSafetyMode(true);
        }
      } else {
        // Turning OFF
        await toggleSafetyMode(user.uid, false);
        stopLocationTracking();
        setSafetyMode(false);
      }
    } catch (err) {
      logger.error(TAG, 'Error toggling Safety Mode:', err);
      Alert.alert('Error', 'Failed to toggle Safety Mode.');
    } finally {
      setSafetyModeLoading(false);
    }
  };

  const handleVoiceSOSToggle = async (newValue) => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      setVoiceSOSLoading(true);

      if (newValue) {
        // We will start Voice Listener in the background service logic separately
        // using the Dashboard hook, or directly via voiceSOSService here.
        await toggleVoiceSOS(user.uid, true);
        setVoiceSOSMode(true);
      } else {
        await toggleVoiceSOS(user.uid, false);
        setVoiceSOSMode(false);
      }
    } catch (err) {
      logger.error(TAG, 'Error toggling Voice SOS:', err);
      Alert.alert('Error', 'Failed to toggle Voice SOS Mode.');
    } finally {
      setVoiceSOSLoading(false);
    }
  };

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
      logger.error(TAG, 'handleSave error:', err);
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
        {/* Safety Mode Toggle */}
        <View style={[styles.section, { borderColor: '#E01111', borderWidth: safetyMode ? 2 : 0 }]}>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <MaterialCommunityIcons
                name="shield-check"
                size={24}
                color={safetyMode ? '#E01111' : '#9AA0A6'}
              />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>
                  Safety Mode: {safetyModeLoading ? '...' : safetyMode ? 'ON' : 'OFF'}
                </Text>
                <Text style={styles.settingDescription}>
                  When enabled, the app continuously tracks your location and allows guardians to
                  monitor your safety.
                </Text>
              </View>
            </View>
            {safetyModeLoading ? (
              <ActivityIndicator size="small" color="#E01111" />
            ) : (
              <Switch
                value={safetyMode}
                onValueChange={handleSafetyModeToggle}
                trackColor={{ false: '#E0E0E2', true: '#E01111' }}
                thumbColor="#fff"
              />
            )}
          </View>

          {/* Nested Voice SOS Option available only when Safety Mode is active */}
          {safetyMode && (
            <View
              style={[
                styles.settingRow,
                { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#E0E0E2' },
              ]}
            >
              <View style={styles.settingLeft}>
                <MaterialCommunityIcons
                  name="microphone"
                  size={22}
                  color={voiceSOSMode ? '#4F2CF5' : '#9AA0A6'}
                />
                <View style={styles.settingText}>
                  <Text style={styles.settingLabel}>Enable Voice SOS Detection</Text>
                  <Text style={styles.settingDescription}>
                    Continuously listen for triggers like &quot;Help Me&quot; or
                    &quot;Emergency&quot; to automatically launch alerts.
                  </Text>
                </View>
              </View>
              {voiceSOSLoading ? (
                <ActivityIndicator size="small" color="#4F2CF5" />
              ) : (
                <Switch
                  value={voiceSOSMode}
                  onValueChange={handleVoiceSOSToggle}
                  trackColor={{ false: '#E0E0E2', true: '#4F2CF5' }}
                  thumbColor="#fff"
                />
              )}
            </View>
          )}
        </View>

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
            Location sharing helps your guardians ensure your safety and provide support when
            needed.
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
