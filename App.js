import Home from './src/screens/Home';
import Login from './src/screens/Login';
import SignUp from './src/screens/SignUp';
import Dashboard from './src/screens/Dashboard';
import GuardianDashboard from './src/screens/GuardianDashboard';
import ConnectedUsersScreen from './src/screens/ConnectedUsersScreen';
import LogoutPopup from './src/screens/LogoutPopup';
import ForgotPass from './src/screens/ForgotPass';
import ProfileScreen from './src/screens/ProfileScreen';
import ChangePassword from './src/screens/ChangePassword';
import NotificationSettings from './src/screens/NotificationSettings';
import LocationSettings from './src/screens/LocationSettings';
import UserLocationMapScreen from './src/screens/UserLocationMapScreen';
import GroupLocationMapScreen from './src/screens/GroupLocationMapScreen';
import AlertHistoryScreen from './src/screens/AlertHistoryScreen';
import AlertTimelineScreen from './src/screens/AlertTimelineScreen';
import SOSCountdownScreen from './src/screens/SOSCountdownScreen';
import AlertActiveScreen from './src/screens/AlertActiveScreen';
import IncomingSOSCallScreen from './src/screens/IncomingSOSCallScreen';
import PhoneLoginScreen from './src/screens/Auth/PhoneLoginScreen';
import VerifyOTPScreen from './src/screens/Auth/VerifyOTPScreen';
import OfflineBanner from './src/components/OfflineBanner';
import { ErrorBoundary } from './src/components/ErrorBoundary';

import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { enableScreens } from 'react-native-screens';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getApps } from 'firebase/app';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import * as Notifications from 'expo-notifications';

import './src/config/firebase';
import { auth, db } from './src/config/firebase';
import { useEffect, useRef, useState } from 'react';
import { checkFirebaseConnection } from './src/utils/checkFirebaseConnection';
import {
  registerForPushNotifications,
  setupForegroundNotificationHandler,
  setupTokenRefreshListener,
  handleNotificationNavigation,
} from './src/services/notificationService';
import {
  prepareOfflineFallback,
  initializeSOSDeliverySystem,
  shutdownSOSDeliverySystem,
} from './src/services/alertService';
import { initializeGuardianEmergencyListener } from './src/services/guardianEmergencyListener';
import logger from './src/utils/logger';

const TAG = '[App]';

enableScreens();

// ─────────────────────────────────────────────────────────────────────────────
// Global navigation ref — lets us navigate from outside React components,
// specifically from the notification-tap listener that runs at module scope.
// ─────────────────────────────────────────────────────────────────────────────
export const navigationRef = createNavigationContainerRef();

// Navigator must be created at module scope — creating inside the component
// body causes a new navigator instance on every render, which resets
// navigation state and leaks memory.
const Stack = createNativeStackNavigator();

export default function App() {
  // Refs to hold cleanup functions so they survive re-renders
  const cleanupForegroundHandler = useRef(null);
  const cleanupTokenRefresh = useRef(null);
  const notifResponseListener = useRef(null);
  const cleanupEmergencyListener = useRef(null);
  const [authSessionResolved, setAuthSessionResolved] = useState(false);
  const [sessionInitialRoute, setSessionInitialRoute] = useState('Home');

  // ── Auth session bootstrap ───────────────────────────────────────────────
  // Resolve persisted auth state before mounting navigator so returning users
  // re-enter directly into their dashboard after app restart.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setSessionInitialRoute('Home');
        setAuthSessionResolved(true);
        return;
      }

      try {
        const userSnap = await getDoc(doc(db, 'users', user.uid));
        const role = userSnap.exists() ? userSnap.data()?.role : null;
        setSessionInitialRoute(role === 'guardian' ? 'GuardianDashboard' : 'Dashboard');
      } catch (error) {
        logger.warn(TAG, 'Failed to resolve role during auth bootstrap:', error);
        setSessionInitialRoute('Dashboard');
      } finally {
        setAuthSessionResolved(true);
      }
    });

    return () => unsubscribe();
  }, []);

  // ── Firebase connection check ──────────────────────────────────────────────
  useEffect(() => {
    checkFirebaseConnection();
    try {
      logger.info(
        TAG,
        'Firebase apps loaded:',
        getApps().map((a) => a.name)
      );
    } catch (e) {
      logger.warn(TAG, 'Unable to read Firebase apps:', e);
    }
  }, []);

  // ── Notification setup — tied to Firebase Auth state ──────────────────────
  // We wait for the user to be authenticated before requesting the push token,
  // because we need their UID to store it in Firestore.
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        logger.info(TAG, 'User authenticated, initializing notifications for:', user.uid);

        // 1. Request permission + get token + set emergency channel + store in Firestore
        let token = null;
        try {
          token = await registerForPushNotifications(user.uid);
          if (token) {
            logger.info(TAG, 'Notifications initialized successfully');
          } else {
            logger.warn(TAG, 'Notification initialization warning or denied');
          }
        } catch (pushErr) {
          logger.error(TAG, 'Notification initialization failed:', pushErr);
        }

        // 1b. Prepare offline SMS fallback cache for guardians while online
        try {
          await prepareOfflineFallback(user.uid);
        } catch (cacheErr) {
          logger.warn(TAG, 'Offline fallback preparation warning:', cacheErr);
        }

        // 1c. Start guaranteed SOS delivery queue + connectivity-aware retry worker
        try {
          await initializeSOSDeliverySystem();
        } catch (queueErr) {
          logger.warn(TAG, 'SOS retry system initialization warning:', queueErr);
        }

        // 2. Set up foreground notification display handler
        if (cleanupForegroundHandler.current) cleanupForegroundHandler.current();
        cleanupForegroundHandler.current = setupForegroundNotificationHandler();

        // 3. Listen for token refresh and update Firestore
        if (cleanupTokenRefresh.current) cleanupTokenRefresh.current();
        cleanupTokenRefresh.current = setupTokenRefreshListener(user.uid);

        // 4. Start guardian emergency listener (incoming SOS call handling)
        if (cleanupEmergencyListener.current) cleanupEmergencyListener.current();
        cleanupEmergencyListener.current = await initializeGuardianEmergencyListener({
          guardianId: user.uid,
          onNavigate: (screen, params) => {
            if (!navigationRef.isReady()) return;
            navigationRef.navigate(screen, params);
          },
        });
      } else {
        // User logged out — clean up listeners
        logger.info(TAG, 'User signed out, cleaning up notification listeners');
        if (cleanupForegroundHandler.current) {
          cleanupForegroundHandler.current();
          cleanupForegroundHandler.current = null;
        }
        if (cleanupTokenRefresh.current) {
          cleanupTokenRefresh.current();
          cleanupTokenRefresh.current = null;
        }
        if (cleanupEmergencyListener.current) {
          cleanupEmergencyListener.current();
          cleanupEmergencyListener.current = null;
        }
        shutdownSOSDeliverySystem();
      }
    });

    return () => {
      unsubscribeAuth();
    };
  }, []);

  // ── Notification tap handler (background / quit state) ────────────────────
  // This fires when the user taps a push notification to open the app.
  // We navigate to the correct screen using the data embedded in the notification.
  useEffect(() => {
    notifResponseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        logger.info(TAG, 'Notification tapped:', response.notification.request.content.data);

        const data = response?.notification?.request?.content?.data;
        if (data?.eventType === 'SOS_CALL') {
          return;
        }

        const navTarget = handleNotificationNavigation(response);
        if (navTarget && navigationRef.isReady()) {
          logger.info(TAG, 'Navigating to:', navTarget.screen, navTarget.params);
          navigationRef.navigate(navTarget.screen, navTarget.params);
        }
      }
    );

    // Also handle the case where the app was launched from a killed state
    // by checking if there's a pending notification response on startup.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = response?.notification?.request?.content?.data;
      if (data?.eventType === 'SOS_CALL') {
        return;
      }
      const navTarget = handleNotificationNavigation(response);
      if (navTarget && navigationRef.isReady()) {
        logger.info(
          TAG,
          'Navigating from launch notification:',
          navTarget.screen,
          navTarget.params
        );
        // Small delay to ensure Navigator is mounted
        setTimeout(() => {
          if (navigationRef.isReady()) {
            navigationRef.navigate(navTarget.screen, navTarget.params);
          }
        }, 500);
      }
    });

    return () => {
      if (notifResponseListener.current) {
        notifResponseListener.current.remove();
      }
    };
  }, []);

  return (
    <ErrorBoundary>
      {/* Wrap with SafeAreaProvider so all screens/components using safe area hooks work */}
      <SafeAreaProvider>
        {/* Wrap entire app stack to easily render fixed absolute views across all flows securely */}
        <View style={{ flex: 1 }}>
          <OfflineBanner />
          {!authSessionResolved ? (
            <View
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#E9EAEE',
              }}
            >
              <ActivityIndicator size="large" color="#3A2BF1" />
            </View>
          ) : (
            <NavigationContainer ref={navigationRef}>
              <Stack.Navigator
                initialRouteName={sessionInitialRoute}
                screenOptions={{ headerShown: false }}
              >
                <Stack.Screen name="Home" component={Home} />
                <Stack.Screen name="Login" component={Login} />
                <Stack.Screen name="SignUp" component={SignUp} />
                <Stack.Screen name="ForgotPass" component={ForgotPass} />
                <Stack.Screen name="PhoneLogin" component={PhoneLoginScreen} />
                <Stack.Screen name="VerifyOTP" component={VerifyOTPScreen} />
                <Stack.Screen name="Dashboard" component={Dashboard} />
                <Stack.Screen name="GuardianDashboard" component={GuardianDashboard} />
                <Stack.Screen name="ConnectedUsers" component={ConnectedUsersScreen} />
                <Stack.Screen name="LogoutPopup" component={LogoutPopup} />
                <Stack.Screen name="Profile" component={ProfileScreen} />
                <Stack.Screen name="ChangePassword" component={ChangePassword} />
                <Stack.Screen name="NotificationSettings" component={NotificationSettings} />
                <Stack.Screen name="LocationSettings" component={LocationSettings} />
                <Stack.Screen name="UserLocationMap" component={UserLocationMapScreen} />
                <Stack.Screen name="LiveMap" component={UserLocationMapScreen} />
                <Stack.Screen name="GroupLocationMap" component={GroupLocationMapScreen} />
                <Stack.Screen name="AlertHistory" component={AlertHistoryScreen} />
                <Stack.Screen name="AlertTimeline" component={AlertTimelineScreen} />
                <Stack.Screen name="SOSCountdownScreen" component={SOSCountdownScreen} />
                <Stack.Screen name="AlertActiveScreen" component={AlertActiveScreen} />
                <Stack.Screen name="IncomingSOSCall" component={IncomingSOSCallScreen} />
              </Stack.Navigator>
            </NavigationContainer>
          )}
        </View>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
