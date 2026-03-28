import React, { useState, useEffect, useRef } from 'react';
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
import { verifyOTP, resendOTP, getOTPErrorMessage } from '../../services/authService';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 30; // seconds
const VERIFICATION_TIMEOUT = 300; // 5 minutes in seconds

const VerifyOTPScreen = ({ navigation, route }) => {
  const { phoneNumber, expiresIn } = route.params || {};

  const [otpDigits, setOtpDigits] = useState(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN);
  const [expiryTimer, setExpiryTimer] = useState(expiresIn || VERIFICATION_TIMEOUT);

  const inputRefs = useRef([]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Expiry timer
  useEffect(() => {
    if (expiryTimer <= 0) {
      setError('OTP has expired. Please request a new code.');
      return;
    }
    const timer = setInterval(() => {
      setExpiryTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleDigitChange = (text, index) => {
    // Only allow numeric input
    const digit = text.replace(/[^0-9]/g, '').slice(-1);
    const newDigits = [...otpDigits];
    newDigits[index] = digit;
    setOtpDigits(newDigits);

    if (error) setError(null);

    // Auto-advance to next input
    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits are filled
    if (digit && index === OTP_LENGTH - 1) {
      const fullCode = newDigits.join('');
      if (fullCode.length === OTP_LENGTH) {
        handleVerify(fullCode);
      }
    }
  };

  const handleKeyPress = (e, index) => {
    // Handle backspace – move to previous input
    if (e.nativeEvent.key === 'Backspace' && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      const newDigits = [...otpDigits];
      newDigits[index - 1] = '';
      setOtpDigits(newDigits);
    }
  };

  const handleVerify = async (code) => {
    const otpCode = code || otpDigits.join('');

    if (otpCode.length !== OTP_LENGTH) {
      setError('Please enter all 6 digits');
      return;
    }

    if (expiryTimer <= 0) {
      setError('OTP has expired. Please request a new code.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await verifyOTP(phoneNumber, otpCode);

      setSuccess(true);

      // Brief success state before navigation
      setTimeout(() => {
        if (result.profile?.role === 'guardian') {
          navigation.replace('GuardianDashboard');
        } else {
          navigation.replace('Dashboard');
        }
      }, 800);
    } catch (err) {
      console.error('[VerifyOTP] verify error:', err);
      setError(getOTPErrorMessage(err));
      // Clear OTP inputs on error
      setOtpDigits(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;

    setError(null);
    try {
      await resendOTP(phoneNumber);
      setResendCooldown(RESEND_COOLDOWN);
      setExpiryTimer(VERIFICATION_TIMEOUT);
      setOtpDigits(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } catch (err) {
      console.error('[VerifyOTP] resend error:', err);
      setError(getOTPErrorMessage(err));
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const maskedPhone = phoneNumber
    ? phoneNumber.slice(0, 4) + '****' + phoneNumber.slice(-3)
    : '***';

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
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.backButton}
              disabled={loading}
            >
              <MaterialCommunityIcons name="arrow-left" size={24} color="#111318" />
            </TouchableOpacity>

            {/* Header */}
            <View style={styles.iconWrap}>
              {success ? (
                <MaterialCommunityIcons name="check-circle" size={56} color="#10B981" />
              ) : (
                <MaterialCommunityIcons name="shield-lock" size={48} color="#0B26FF" />
              )}
            </View>

            <Text style={styles.title}>{success ? 'Verified!' : 'Enter OTP Code'}</Text>
            <Text style={styles.subtitle}>
              {success
                ? 'Your phone number has been verified successfully.'
                : `A 6-digit code was sent to ${maskedPhone}`}
            </Text>

            {!success && (
              <>
                {/* Expiry Timer */}
                <View style={styles.timerRow}>
                  <MaterialCommunityIcons
                    name="timer-outline"
                    size={16}
                    color={expiryTimer < 60 ? '#EF4444' : '#6B7280'}
                  />
                  <Text style={[styles.timerText, expiryTimer < 60 && styles.timerTextExpiring]}>
                    Code expires in {formatTime(expiryTimer)}
                  </Text>
                </View>

                {/* OTP Input Boxes */}
                <View style={styles.otpRow}>
                  {otpDigits.map((digit, index) => (
                    <TextInput
                      key={index}
                      ref={(ref) => (inputRefs.current[index] = ref)}
                      style={[
                        styles.otpBox,
                        digit ? styles.otpBoxFilled : null,
                        error ? styles.otpBoxError : null,
                      ]}
                      value={digit}
                      onChangeText={(text) => handleDigitChange(text, index)}
                      onKeyPress={(e) => handleKeyPress(e, index)}
                      keyboardType="number-pad"
                      maxLength={1}
                      selectTextOnFocus
                      editable={!loading}
                    />
                  ))}
                </View>

                {/* Error Message */}
                {error && (
                  <View style={styles.errorContainer}>
                    <MaterialCommunityIcons name="alert-circle" size={16} color="#EF4444" />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                {/* Verify Button */}
                <View style={styles.buttonWrap}>
                  {loading ? (
                    <View style={styles.loadingBtn}>
                      <ActivityIndicator color="#fff" />
                      <Text style={styles.loadingText}>Verifying...</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[
                        styles.primaryButton,
                        otpDigits.join('').length < OTP_LENGTH && styles.primaryButtonDisabled,
                      ]}
                      onPress={() => handleVerify()}
                      activeOpacity={0.8}
                      disabled={otpDigits.join('').length < OTP_LENGTH}
                    >
                      <Text style={styles.primaryButtonText}>Verify Code</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Resend OTP */}
                <View style={styles.resendWrap}>
                  <Text style={styles.resendPrompt}>Didn{"'"}t receive the code? </Text>
                  {resendCooldown > 0 ? (
                    <Text style={styles.resendCooldownText}>Resend in {resendCooldown}s</Text>
                  ) : (
                    <TouchableOpacity onPress={handleResend}>
                      <Text style={styles.resendLink}>Resend Code</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
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
    fontSize: 26,
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
    marginBottom: 24,
    lineHeight: 20,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 20,
  },
  timerText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
  },
  timerTextExpiring: {
    color: '#EF4444',
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  otpBox: {
    width: 44,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    fontSize: 22,
    fontWeight: '800',
    color: '#111318',
    textAlign: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  otpBoxFilled: {
    borderColor: '#0B26FF',
    backgroundColor: '#F0F1FF',
  },
  otpBoxError: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
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
    marginBottom: 20,
  },
  primaryButton: {
    backgroundColor: '#0B26FF',
    paddingVertical: 16,
    paddingHorizontal: 22,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.5,
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
  resendWrap: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resendPrompt: {
    fontSize: 13,
    color: '#6B7280',
  },
  resendCooldownText: {
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  resendLink: {
    fontSize: 13,
    color: '#0B26FF',
    fontWeight: '700',
  },
});

export default VerifyOTPScreen;
