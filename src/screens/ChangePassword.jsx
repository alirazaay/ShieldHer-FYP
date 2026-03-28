import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { auth } from '../config/firebase';
import PrimaryButton from '../components/PrimaryButton';
import { changePassword, getErrorMessage } from '../services/profile';

const ChangePasswordScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const handleChangePassword = async () => {
    try {
      // Validation
      if (!oldPassword?.trim()) {
        setMessage({ text: 'Current password is required', type: 'error' });
        return;
      }

      if (!newPassword?.trim()) {
        setMessage({ text: 'New password is required', type: 'error' });
        return;
      }

      if (!confirmPassword?.trim()) {
        setMessage({ text: 'Please confirm your new password', type: 'error' });
        return;
      }

      if (newPassword.length < 6) {
        setMessage({ text: 'New password must be at least 6 characters', type: 'error' });
        return;
      }

      if (newPassword !== confirmPassword) {
        setMessage({ text: 'Passwords do not match', type: 'error' });
        return;
      }

      if (oldPassword === newPassword) {
        setMessage({
          text: 'New password must be different from current password',
          type: 'error',
        });
        return;
      }

      setLoading(true);
      const user = auth.currentUser;

      if (!user) {
        navigation?.replace('Login');
        return;
      }

      // Change password using auth service
      await changePassword(user.email, oldPassword, newPassword);

      setMessage({ text: 'Password changed successfully!', type: 'success' });

      // Clear fields
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');

      // Auto-navigate back after success
      setTimeout(() => {
        navigation?.goBack();
      }, 2000);
    } catch (err) {
      console.error('[ChangePasswordScreen] handleChangePassword error:', err);
      setMessage({ text: getErrorMessage(err), type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation?.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialCommunityIcons name="chevron-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Change Password</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Content */}
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Instruction */}
        <View style={styles.instructionBox}>
          <MaterialCommunityIcons name="information" size={20} color="#0B26FF" />
          <Text style={styles.instructionText}>
            Enter your current password and choose a new password for your account.
          </Text>
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

        {/* Form Section */}
        <View style={styles.section}>
          {/* Current Password */}
          <View style={styles.formBlock}>
            <Text style={styles.label}>Current Password</Text>
            <View style={styles.passwordInputContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Enter your current password"
                placeholderTextColor="#9AA0A6"
                secureTextEntry={!showOldPassword}
                value={oldPassword}
                onChangeText={setOldPassword}
                editable={!loading}
              />
              <TouchableOpacity
                onPress={() => setShowOldPassword(!showOldPassword)}
                style={styles.eyeIcon}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialCommunityIcons
                  name={showOldPassword ? 'eye-off' : 'eye'}
                  size={20}
                  color="#555"
                />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.spacer} />

          {/* New Password */}
          <View style={styles.formBlock}>
            <Text style={styles.label}>New Password</Text>
            <View style={styles.passwordInputContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Enter your new password"
                placeholderTextColor="#9AA0A6"
                secureTextEntry={!showNewPassword}
                value={newPassword}
                onChangeText={setNewPassword}
                editable={!loading}
              />
              <TouchableOpacity
                onPress={() => setShowNewPassword(!showNewPassword)}
                style={styles.eyeIcon}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialCommunityIcons
                  name={showNewPassword ? 'eye-off' : 'eye'}
                  size={20}
                  color="#555"
                />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.spacer} />

          {/* Confirm Password */}
          <View style={styles.formBlock}>
            <Text style={styles.label}>Confirm New Password</Text>
            <View style={styles.passwordInputContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Confirm your new password"
                placeholderTextColor="#9AA0A6"
                secureTextEntry={!showConfirmPassword}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                editable={!loading}
              />
              <TouchableOpacity
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                style={styles.eyeIcon}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialCommunityIcons
                  name={showConfirmPassword ? 'eye-off' : 'eye'}
                  size={20}
                  color="#555"
                />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.spacer} />
          <View style={styles.spacer} />

          {/* Submit Button */}
          <PrimaryButton
            title={loading ? 'Updating...' : 'Update Password'}
            onPress={handleChangePassword}
            disabled={loading}
          />
        </View>

        <View style={{ height: insets.bottom + 20 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

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
    paddingTop: 16,
  },
  instructionBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#0B26FF',
  },
  instructionText: {
    flex: 1,
    fontSize: 14,
    color: '#3D3F44',
    fontWeight: '500',
  },
  messageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 16,
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
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  formBlock: {
    width: '100%',
  },
  label: {
    fontSize: 16,
    fontWeight: '800',
    color: '#3D3F44',
    marginBottom: 10,
  },
  passwordInputContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E2',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  passwordInput: {
    flex: 1,
    fontSize: 15,
    color: '#111318',
  },
  eyeIcon: {
    padding: 8,
    marginLeft: 4,
  },
  spacer: {
    height: 12,
  },
});

export default ChangePasswordScreen;
