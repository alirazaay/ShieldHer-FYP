import Home from './src/screens/Home';
import Login from './src/screens/Login';
import SignUp from './src/screens/SignUp';
import Dashboard from './src/screens/Dashboard';
import GuardianDashboard from './src/screens/GuardianDashboard';
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
import OfflineBanner from './src/components/OfflineBanner';

import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { enableScreens } from 'react-native-screens';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getApps } from 'firebase/app';
import { onAuthStateChanged } from 'firebase/auth';
import * as Notifications from 'expo-notifications';

import './src/config/firebase';
import { auth } from './src/config/firebase';
import { useEffect, useRef } from 'react';
import { checkFirebaseConnection } from './src/utils/checkFirebaseConnection';
import {
  registerForPushNotifications,
  setupForegroundNotificationHandler,
  setupTokenRefreshListener,
  handleNotificationNavigation,
} from './src/services/notificationService';

enableScreens();

// ─────────────────────────────────────────────────────────────────────────────
// Global navigation ref — lets us navigate from outside React components,
// specifically from the notification-tap listener that runs at module scope.
// ─────────────────────────────────────────────────────────────────────────────
export const navigationRef = createNavigationContainerRef();

export default function App() {
  const Stack = createNativeStackNavigator();

  // Refs to hold cleanup functions so they survive re-renders
  const cleanupForegroundHandler = useRef(null);
  const cleanupTokenRefresh = useRef(null);
  const notifResponseListener = useRef(null);

  // ── Firebase connection check ──────────────────────────────────────────────
  useEffect(() => {
    checkFirebaseConnection();
    try {
      console.log('Firebase apps loaded:', getApps().map(a => a.name));
    } catch (e) {
      console.warn('Unable to read Firebase apps:', e);
    }
  }, []);

  // ── Notification setup — tied to Firebase Auth state ──────────────────────
  // We wait for the user to be authenticated before requesting the push token,
  // because we need their UID to store it in Firestore.
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        console.log('[App] User authenticated, initializing notifications for:', user.uid);

        // 1. Request permission + get token + set emergency channel + store in Firestore
        const token = await registerForPushNotifications(user.uid);
        if (token) {
          console.log('[App] Notifications initialized successfully');
        } else {
          console.warn('[App] Notification initialization warning or denied');
        }

        // 2. Set up foreground notification display handler
        if (cleanupForegroundHandler.current) cleanupForegroundHandler.current();
        cleanupForegroundHandler.current = setupForegroundNotificationHandler();

        // 3. Listen for token refresh and update Firestore
        if (cleanupTokenRefresh.current) cleanupTokenRefresh.current();
        cleanupTokenRefresh.current = setupTokenRefreshListener(user.uid);

      } else {
        // User logged out — clean up listeners
        console.log('[App] User signed out, cleaning up notification listeners');
        if (cleanupForegroundHandler.current) {
          cleanupForegroundHandler.current();
          cleanupForegroundHandler.current = null;
        }
        if (cleanupTokenRefresh.current) {
          cleanupTokenRefresh.current();
          cleanupTokenRefresh.current = null;
        }
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
        console.log('[App] Notification tapped:', response.notification.request.content.data);

        const navTarget = handleNotificationNavigation(response);
        if (navTarget && navigationRef.isReady()) {
          console.log('[App] Navigating to:', navTarget.screen, navTarget.params);
          navigationRef.navigate(navTarget.screen, navTarget.params);
        }
      }
    );

    // Also handle the case where the app was launched from a killed state
    // by checking if there's a pending notification response on startup.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const navTarget = handleNotificationNavigation(response);
      if (navTarget && navigationRef.isReady()) {
        console.log('[App] Navigating from launch notification:', navTarget.screen, navTarget.params);
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
    // Wrap with SafeAreaProvider so all screens/components using safe area hooks work
    <SafeAreaProvider>
      {/* Wrap entire app stack to easily render fixed absolute views across all flows securely */}
      <View style={{ flex: 1 }}>
        <OfflineBanner />
        {/* Pass navigationRef so we can navigate from notification handlers */}
        <NavigationContainer ref={navigationRef}>
          <Stack.Navigator initialRouteName="Home" screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Home" component={Home} />
            <Stack.Screen name="Login" component={Login} />
            <Stack.Screen name="SignUp" component={SignUp} />
            <Stack.Screen name="ForgotPass" component={ForgotPass} />
            <Stack.Screen name="Dashboard" component={Dashboard} />
            <Stack.Screen name="GuardianDashboard" component={GuardianDashboard} />
            <Stack.Screen name="LogoutPopup" component={LogoutPopup} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="ChangePassword" component={ChangePassword} />
            <Stack.Screen name="NotificationSettings" component={NotificationSettings} />
            <Stack.Screen name="LocationSettings" component={LocationSettings} />
            <Stack.Screen name="UserLocationMap" component={UserLocationMapScreen} />
            <Stack.Screen name="GroupLocationMap" component={GroupLocationMapScreen} />
            <Stack.Screen name="AlertHistory" component={AlertHistoryScreen} />
            <Stack.Screen name="AlertTimeline" component={AlertTimelineScreen} />
            <Stack.Screen name="SOSCountdownScreen" component={SOSCountdownScreen} />
            <Stack.Screen name="AlertActiveScreen" component={AlertActiveScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </View>
    </SafeAreaProvider>
  );
}

