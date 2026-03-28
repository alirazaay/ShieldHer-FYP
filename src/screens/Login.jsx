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
  TextInput,
  ActivityIndicator,
} from 'react-native';
import FormInput from '../components/FormInput';
import PrimaryButton from '../components/PrimaryButton';
import { loginUser } from '../services/auth';
import { auth, db } from '../config/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// Phone login navigation
const goPhoneLogin = (navigation) => {
  if (navigation?.navigate) navigation.navigate('PhoneLogin');
};

const TAB_TYPES = {
  USER: 'USER',
  GUARDIAN: 'GUARDIAN',
};

const Login = ({ navigation }) => {
  const [activeTab, setActiveTab] = useState(TAB_TYPES.USER);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }
    setLoading(true);
    try {
      console.log('[Login] Firebase app:', auth?.app?.name);
      const userCred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const user = userCred.user;
      console.log('[Login] Authenticated uid:', user?.uid);
      const docRef = doc(db, 'users', user.uid);
      const snap = await getDoc(docRef);
      if (!snap.exists()) {
        Alert.alert('Error', 'User role not found in database');
        console.warn('[Login] Missing user doc; falling back to tab role');
        const fallbackRole = activeTab === TAB_TYPES.GUARDIAN ? 'guardian' : 'user';
        if (navigation?.navigate)
          navigation.navigate(fallbackRole === 'guardian' ? 'GuardianDashboard' : 'Dashboard');
        return;
      }
      const role = snap.data().role;
      console.log('[Login] Loaded role:', role);
      if (navigation?.navigate)
        navigation.navigate(role === 'guardian' ? 'GuardianDashboard' : 'Dashboard');
    } catch (e) {
      console.error('[Login] Error during login:', e);
      let message = e?.message ?? 'Please try again.';
      if (e?.code === 'auth/invalid-credential' || e?.code === 'auth/wrong-password')
        message = 'Incorrect password.';
      if (e?.code === 'auth/user-not-found') message = 'No account found with that email.';
      Alert.alert('Login Failed', message);
    } finally {
      setLoading(false);
    }
  };

  const goRegister = () => {
    if (navigation?.navigate) navigation.navigate('SignUp');
  };

  const goForgot = () => {
    if (navigation?.navigate) navigation.navigate('ForgotPass');
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
            <Text style={styles.title}>Login Securely</Text>

            {/* Segmented Tabs */}
            <View style={styles.tabs}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setActiveTab(TAB_TYPES.USER)}
                style={[styles.tab, activeTab === TAB_TYPES.USER && styles.tabActive]}
              >
                <Text
                  style={[styles.tabText, activeTab === TAB_TYPES.USER && styles.tabTextActive]}
                >
                  User Login
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setActiveTab(TAB_TYPES.GUARDIAN)}
                style={[styles.tab, activeTab === TAB_TYPES.GUARDIAN && styles.tabActive]}
              >
                <Text
                  style={[styles.tabText, activeTab === TAB_TYPES.GUARDIAN && styles.tabTextActive]}
                >
                  Guardian Login
                </Text>
              </TouchableOpacity>
            </View>

            {/* Email Input */}
            <View style={styles.section}>
              <FormInput
                label="Email Address"
                value={email}
                onChangeText={setEmail}
                placeholder="you@gmail.com"
                keyboardType="email-address"
              />
            </View>

            {/* Password Input with eye toggle */}
            <View style={styles.section}>
              <Text style={styles.passLabel}>Password</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  placeholder="********"
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
              <TouchableOpacity onPress={goForgot} style={styles.forgotWrap}>
                <Text style={styles.forgotText}>Forgot Password?</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.buttonWrap}>
              {loading ? (
                <View style={styles.loadingBtn}>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.loadingText}>Authenticating...</Text>
                </View>
              ) : (
                <PrimaryButton title="Login Securely" onPress={handleLogin} disabled={loading} />
              )}
            </View>

            {/* Phone Login Option */}
            <TouchableOpacity
              style={styles.phoneLoginBtn}
              onPress={() => goPhoneLogin(navigation)}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="cellphone-key"
                size={18}
                color="#0B26FF"
                style={{ marginRight: 8 }}
              />
              <Text style={styles.phoneLoginText}>Login with Phone Number</Text>
            </TouchableOpacity>

            <View style={styles.registerWrap}>
              <Text style={styles.registerPrompt}>
                New User?{' '}
                <Text onPress={goRegister} style={styles.registerLink}>
                  Register Now
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
    backgroundColor: '#DFDFE0', // subtle card tone matching screenshot
    borderRadius: 18,
    paddingHorizontal: 22,
    paddingTop: 34,
    paddingBottom: 36,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#111318',
    letterSpacing: -0.5,
    marginBottom: 26,
    textAlign: 'left',
  },
  tabs: {
    flexDirection: 'row',
    marginBottom: 40,
  },
  tab: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  tabActive: {
    backgroundColor: '#0B26FF',
  },
  tabText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#111318',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  section: {
    marginBottom: 34,
  },
  forgotWrap: {
    marginTop: 10,
    alignItems: 'center',
  },
  forgotText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0B26FF',
  },
  buttonWrap: {
    marginTop: 8,
    marginBottom: 38,
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
  phoneLoginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: '#0B26FF',
    backgroundColor: 'transparent',
    marginBottom: 24,
  },
  phoneLoginText: {
    color: '#0B26FF',
    fontWeight: '800',
    fontSize: 14,
  },
  passLabel: {
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
  eyeIcon: { padding: 6 },
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
});

export default Login;
