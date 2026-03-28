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
  Alert,
} from 'react-native';
import FormInput from '../components/FormInput';
import PrimaryButton from '../components/PrimaryButton';
import { resetPassword } from '../services/auth';

const ForgotPass = ({ navigation }) => {
  const [email, setEmail] = useState('');

  const handleSend = async () => {
    try {
      if (!email) return Alert.alert('Missing email', 'Please enter your account email.');
      await resetPassword(email.trim());
      Alert.alert('Email sent', 'Password reset link sent. Check your inbox.', [
        { text: 'OK', onPress: () => goLogin() },
      ]);
    } catch (e) {
      Alert.alert('Error', e?.message ?? 'Could not send reset email');
    }
  };

  const goLogin = () => {
    if (navigation?.goBack) navigation.goBack();
    else if (navigation?.navigate) navigation.navigate('Login');
  };

  const goSignUp = () => {
    if (navigation?.navigate) navigation.navigate('SignUp');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.cardOuter}>
            <View style={styles.card}>
              <Text style={styles.headline}>
                <Text style={styles.headlineAccent}>Forgot</Text> Your Password?
              </Text>
              <Text style={styles.description}>
                Enter the email associated with your account, and we&apos;ll send you a link to
                reset your password.Account Email Address
              </Text>

              <View style={styles.inputBlock}>
                <FormInput
                  label="Account Email Address"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="your@gmail.com"
                  keyboardType="email-address"
                  outerStyle={styles.grayInput}
                />
              </View>

              <View style={styles.buttonWrap}>
                <PrimaryButton title="Send Reset Link" onPress={handleSend} />
              </View>

              <TouchableOpacity onPress={goLogin} style={styles.backWrap}>
                <Text style={styles.backText}>Back to Login</Text>
              </TouchableOpacity>

              <View style={styles.signupWrap}>
                <Text style={styles.signupPrompt}>
                  Dont have an account?{' '}
                  <Text onPress={goSignUp} style={styles.signupLink}>
                    Sign Up
                  </Text>
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  cardOuter: {
    width: '90%',
    borderWidth: 2,
    borderColor: '#1662FF',
    borderRadius: 10,
    padding: 10,
  },
  card: {
    backgroundColor: '#DFDFE0',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingTop: 24,
    paddingBottom: 26,
  },
  headline: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111318',
    marginBottom: 8,
  },
  headlineAccent: {
    color: '#4F2CF5',
  },
  description: {
    fontSize: 12.5,
    color: '#4B5057',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 22,
  },
  inputBlock: {
    marginBottom: 22,
  },
  grayInput: {
    backgroundColor: '#D8D8DA',
  },
  buttonWrap: {
    marginTop: 6,
    marginBottom: 18,
  },
  backWrap: {
    alignItems: 'center',
    marginBottom: 14,
  },
  backText: {
    color: '#1E34FF',
    fontWeight: '800',
  },
  signupWrap: { alignItems: 'center' },
  signupPrompt: { fontWeight: '800', color: '#111318' },
  signupLink: { color: '#FF7A00', fontWeight: '900' },
});

export default ForgotPass;
