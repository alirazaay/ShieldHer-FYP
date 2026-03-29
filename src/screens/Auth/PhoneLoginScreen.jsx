import React, { useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { sendOTP, getOTPErrorMessage } from '../../services/authService';
import { buildPhoneNumber } from '../../utils/phone';
import logger from '../../utils/logger';

const TAG = '[PhoneLogin]';

const PhoneLoginScreen = ({ navigation }) => {
  const [countryCode, setCountryCode] = useState('+92');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fullPhoneNumber = buildPhoneNumber(countryCode, phoneNumber);

  const handleSendOTP = async () => {
    if (!fullPhoneNumber) {
      setError('Please enter a valid phone number');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await sendOTP(fullPhoneNumber);

      if (result.success) {
        navigation.navigate('VerifyOTP', {
          phoneNumber: fullPhoneNumber,
          expiresIn: result.expiresIn,
        });
      }
    } catch (err) {
      logger.error(TAG, 'sendOTP error:', err);
      setError(getOTPErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            {/* Back Button */}
            <TouchableOpacity onPress={goBack} style={styles.backButton}>
              <MaterialCommunityIcons name="arrow-left" size={24} color="#111318" />
            </TouchableOpacity>

            {/* Header */}
            <View style={styles.iconWrap}>
              <MaterialCommunityIcons name="cellphone-key" size={48} color="#0B26FF" />
            </View>
            <Text style={styles.title}>Phone Verification</Text>
            <Text style={styles.subtitle}>
              Enter your phone number to receive a one-time verification code via SMS.
            </Text>

            {/* Phone Number Input */}
            <View style={styles.section}>
              <Text style={styles.inputLabel}>Phone Number</Text>
              <View style={styles.phoneRow}>
                {/* Country Code */}
                <View style={styles.countryCodeContainer}>
                  <TextInput
                    style={styles.countryCodeInput}
                    value={countryCode}
                    onChangeText={(text) => {
                      const digits = text.replace(/\D/g, '').slice(0, 3);
                      setCountryCode(digits ? `+${digits}` : '+');
                      if (error) setError(null);
                    }}
                    keyboardType="phone-pad"
                    maxLength={4}
                    placeholder="+92"
                    placeholderTextColor="#9AA0A6"
                  />
                </View>

                {/* Phone Number */}
                <View style={styles.phoneInputContainer}>
                  <TextInput
                    style={styles.phoneInput}
                    value={phoneNumber}
                    onChangeText={(text) => {
                      setPhoneNumber(text.replace(/[^0-9]/g, ''));
                      if (error) setError(null);
                    }}
                    placeholder="3001234567"
                    placeholderTextColor="#9AA0A6"
                    keyboardType="phone-pad"
                    maxLength={12}
                    autoFocus
                  />
                </View>
              </View>
            </View>

            {/* Error Message */}
            {error && (
              <View style={styles.errorContainer}>
                <MaterialCommunityIcons name="alert-circle" size={16} color="#EF4444" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Send OTP Button */}
            <View style={styles.buttonWrap}>
              {loading ? (
                <View style={styles.loadingBtn}>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.loadingText}>Sending OTP...</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={handleSendOTP}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons
                    name="message-text-lock"
                    size={20}
                    color="#fff"
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.primaryButtonText}>Send Verification Code</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Info Note */}
            <View style={styles.infoNote}>
              <MaterialCommunityIcons name="shield-check" size={16} color="#6B7280" />
              <Text style={styles.infoText}>
                Standard SMS rates may apply. Your number is securely verified.
              </Text>
            </View>

            {/* Back to Email Login */}
            <View style={styles.registerWrap}>
              <Text style={styles.registerPrompt}>
                Prefer email?{' '}
                <Text onPress={goBack} style={styles.registerLink}>
                  Login with Email
                </Text>
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#E9EAEE',
  },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  card: {
    width: '88%',
    backgroundColor: '#DFDFE0',
    borderRadius: 18,
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 36,
  },
  backButton: {
    alignSelf: 'flex-start',
    padding: 4,
    marginBottom: 12,
  },
  iconWrap: {
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111318',
    letterSpacing: -0.5,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 20,
  },
  section: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: '#3D3F44',
    marginBottom: 10,
  },
  phoneRow: {
    flexDirection: 'row',
    gap: 8,
  },
  countryCodeContainer: {
    width: 70,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 52,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  countryCodeInput: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111318',
    textAlign: 'center',
  },
  phoneInputContainer: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  phoneInput: {
    fontSize: 16,
    color: '#111318',
    letterSpacing: 1,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  buttonWrap: {
    marginTop: 8,
    marginBottom: 20,
  },
  primaryButton: {
    backgroundColor: '#0B26FF',
    paddingVertical: 16,
    paddingHorizontal: 22,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
  loadingBtn: {
    backgroundColor: '#0B26FF',
    paddingVertical: 16,
    paddingHorizontal: 22,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  loadingText: { color: '#fff', fontWeight: '800', marginLeft: 10 },
  infoNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 20,
  },
  infoText: {
    fontSize: 11,
    color: '#6B7280',
    textAlign: 'center',
  },
  registerWrap: {
    alignItems: 'center',
  },
  registerPrompt: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111318',
  },
  registerLink: {
    color: '#0B26FF',
  },
});

export default PhoneLoginScreen;
