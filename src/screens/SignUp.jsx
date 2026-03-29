import React, { useState, useEffect } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FormInput from '../components/FormInput';
import PrimaryButton from '../components/PrimaryButton';
import { registerUser, getAuthErrorMessage } from '../services/auth';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import logger from '../utils/logger';

const TAG = '[SignUp]';

const SignUp = ({ navigation }) => {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [emergencyEmail, setEmergencyEmail] = useState('');
  const [relationship, setRelationship] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState('user');
  const [message, setMessage] = useState(null); // { text: string, type: 'success' | 'error' }
  const [isLoading, setIsLoading] = useState(false);

  // Configurable delay for auto-hiding messages (4 seconds)
  const MESSAGE_AUTO_HIDE_DELAY = 4000;

  // Debug: Log message changes
  useEffect(() => {
    logger.info(TAG, 'Message state changed:', message);
  }, [message]);

  // Auto-hide message after configurable delay with cleanup to prevent memory leaks
  useEffect(() => {
    let timer;
    if (message) {
      timer = setTimeout(() => {
        setMessage(null);
      }, MESSAGE_AUTO_HIDE_DELAY);
    }

    // Cleanup function to cancel timeout when component unmounts or message changes
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [message]);

  const handleCreate = async () => {
    // Disable button immediately to prevent double submissions
    setIsLoading(true);

    try {
      // Clear any previous messages
      setMessage(null);

      logger.info(TAG, 'Starting registration');

      // Call the service function with all required data
      const cred = await registerUser({
        email: accountEmail,
        password,
        role,
        profile: {
          fullName,
          phone,
          ...(role === 'user' ? { emergencyPhone, emergencyEmail } : { relationship }),
        },
      });

      logger.info(TAG, 'Registration successful:', cred.user.uid);

      // Display success message on screen
      setMessage({ text: 'Signup Completed', type: 'success' });

      // Re-enable button after successful signup
      setIsLoading(false);

      // Navigate after a delay to show the success message
      setTimeout(() => {
        navigation?.navigate(role === 'guardian' ? 'GuardianDashboard' : 'Dashboard');
      }, 2000);
    } catch (e) {
      logger.error(TAG, 'Registration error:', e);

      // Display user-friendly error message using service function
      const errorMessage = getAuthErrorMessage(e);
      setMessage({ text: errorMessage, type: 'error' });

      // Re-enable button after error
      setIsLoading(false);
    }
  };

  const goLogin = () => {
    if (navigation?.navigate) navigation.navigate('Login');
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
            <Text style={styles.brandLine}>
              <Text style={styles.brandAccent}>ShieldHer</Text> Sign Up
            </Text>
            <Text style={styles.subtitle}>Create your security-focused account</Text>

            {/* Role Segmented Tabs */}
            <View style={styles.tabs}>
              <TouchableOpacity
                onPress={() => setRole('user')}
                style={[styles.tab, role === 'user' && styles.tabActive]}
              >
                <Text style={[styles.tabText, role === 'user' && styles.tabTextActive]}>User</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setRole('guardian')}
                style={[styles.tab, role === 'guardian' && styles.tabActive]}
              >
                <Text style={[styles.tabText, role === 'guardian' && styles.tabTextActive]}>
                  Guardian
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.formBlock}>
              <FormInput
                label="Full Name"
                value={fullName}
                onChangeText={setFullName}
                placeholder="Enter your full name"
              />
            </View>

            <View style={styles.formBlock}>
              <FormInput
                label="Your Phone Number"
                value={phone}
                onChangeText={setPhone}
                placeholder="e.g. , +92 xxxx-xxxxx"
                keyboardType="phone-pad"
              />
            </View>

            {role === 'user' && (
              <>
                <View style={styles.formBlock}>
                  <FormInput
                    label="Emergency Contact Number"
                    value={emergencyPhone}
                    onChangeText={setEmergencyPhone}
                    placeholder="e.g. , +92 xxxx-xxxxx"
                    keyboardType="phone-pad"
                  />
                </View>
                <View style={styles.formBlock}>
                  <FormInput
                    label="Emergency Contact Email"
                    value={emergencyEmail}
                    onChangeText={setEmergencyEmail}
                    placeholder="guardian@gmail.com"
                    keyboardType="email-address"
                  />
                </View>
              </>
            )}
            {role === 'guardian' && (
              <View style={styles.formBlock}>
                <FormInput
                  label="Relationship to User"
                  value={relationship}
                  onChangeText={setRelationship}
                  placeholder="Parent, sibling, friend…"
                />
              </View>
            )}

            <View style={styles.formBlock}>
              <FormInput
                label="Account  Email Address"
                value={accountEmail}
                onChangeText={setAccountEmail}
                placeholder="your@gmail.com"
                keyboardType="email-address"
              />
            </View>

            <View style={styles.formBlock}>
              <Text style={styles.piLabel}>Password</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  placeholder="Password"
                  placeholderTextColor="#9AA0A6"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  style={styles.passwordInput}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeIcon}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <MaterialCommunityIcons
                    name={showPassword ? 'eye-off' : 'eye'}
                    size={22}
                    color="#555"
                  />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.buttonWrap}>
              <PrimaryButton
                title={isLoading ? 'Creating Account...' : 'Create Account'}
                onPress={handleCreate}
                disabled={isLoading}
              />
            </View>

            {/* Message Display */}
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
                    size={24}
                    color="#10B981"
                    style={styles.messageIcon}
                  />
                )}
                {message.type === 'error' && (
                  <MaterialCommunityIcons
                    name="alert-circle"
                    size={24}
                    color="#EF4444"
                    style={styles.messageIcon}
                  />
                )}
                <Text
                  style={[
                    styles.messageText,
                    message.type === 'success'
                      ? styles.messageTextSuccess
                      : styles.messageTextError,
                  ]}
                >
                  {message.text}
                </Text>
              </View>
            )}

            <View style={styles.loginWrap}>
              <Text style={styles.loginPrompt}>
                Already have an account?{' '}
                <Text onPress={goLogin} style={styles.loginLink}>
                  Login Here
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
    paddingVertical: 28,
    paddingBottom: 80,
  },
  card: {
    width: '90%',
    backgroundColor: '#DFDFE0',
    borderRadius: 12,
    paddingHorizontal: 26,
    paddingTop: 30,
    paddingBottom: 34,
  },
  brandLine: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111318',
    marginBottom: 6,
  },
  brandAccent: {
    color: '#1E34FF',
  },
  subtitle: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#4B5057',
    marginBottom: 28,
  },
  formBlock: {
    marginBottom: 22,
  },
  piLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: '#3D3F44',
    marginBottom: 10,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFFFFF',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 10,
    marginVertical: 0,
    height: 46,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111318',
    paddingRight: 6,
  },
  eyeIcon: {
    padding: 6,
  },
  buttonWrap: {
    marginTop: 8,
    marginBottom: 26,
  },
  loginWrap: {
    alignItems: 'center',
  },
  loginPrompt: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#111318',
  },
  loginLink: {
    color: '#1E34FF',
  },
  tabs: { flexDirection: 'row', marginBottom: 18 },
  tab: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  tabActive: { backgroundColor: '#0B26FF' },
  tabText: { fontWeight: '800', color: '#111318' },
  tabTextActive: { color: '#FFFFFF' },
  messageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 20,
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
    marginRight: 10,
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
});

export default SignUp;
