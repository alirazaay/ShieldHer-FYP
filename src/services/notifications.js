import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Platform } from 'react-native';

// ─────────────────────────────────────────────────────────────────────────────
// Configure how notifications appear when the app is in the FOREGROUND
// ─────────────────────────────────────────────────────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,   // Show banner even when app is open
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Request OS-level push notification permission
// @returns {Promise<{ granted: boolean, status: string }>}
// ─────────────────────────────────────────────────────────────────────────────
export async function requestNotificationPermission() {
  console.log('[notifications] requestNotificationPermission start');

  if (!Device.isDevice) {
    console.warn('[notifications] Push notifications are not supported on emulators/simulators');
    return {
      granted: false,
      status: 'unavailable',
      message: 'Push notifications only work on physical devices.',
    };
  }

  try {
    // Check existing permission status first
    const { status: existingStatus } = await Notifications.getPermissionsAsync();

    if (existingStatus === 'granted') {
      console.log('[notifications] Permission already granted');
      return { granted: true, status: 'granted' };
    }

    // Request permission from user
    const { status } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
        allowCriticalAlerts: false,
      },
    });

    if (status === 'granted') {
      console.log('[notifications] Permission granted by user');
      return { granted: true, status: 'granted' };
    } else {
      console.warn('[notifications] Permission denied by user');
      return {
        granted: false,
        status: 'denied',
        message: 'Push notification permission denied. Enable it in your device Settings to receive SOS alerts.',
      };
    }
  } catch (error) {
    console.error('[notifications] requestNotificationPermission error:', error);
    return {
      granted: false,
      status: 'error',
      message: 'Failed to request notification permission.',
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Get the Expo Push Token for this device
// @returns {Promise<string|null>} Expo push token string or null on failure
// ─────────────────────────────────────────────────────────────────────────────
export async function getExpoPushToken() {
  console.log('[notifications] getExpoPushToken start');

  try {
    if (!Device.isDevice) {
      console.warn('[notifications] Cannot get push token on emulator');
      return null;
    }

    // Android requires a notification channel to be set before getting token
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('sos-alerts', {
        name: 'SOS Alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#E01111',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });
      console.log('[notifications] Android notification channel set');
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: '60d17df5-f61e-4c96-951f-ebd84c5c8f16', // from app.json expo.extra.eas.projectId if available; use owner slug fallback
    });

    console.log('[notifications] Expo push token retrieved:', tokenData.data);
    return tokenData.data;
  } catch (error) {
    // If projectId is missing, try without it (works for classic Expo builds)
    try {
      console.warn('[notifications] Retrying getExpoPushTokenAsync without projectId...');
      const tokenData = await Notifications.getExpoPushTokenAsync();
      console.log('[notifications] Expo push token retrieved (fallback):', tokenData.data);
      return tokenData.data;
    } catch (fallbackError) {
      console.error('[notifications] getExpoPushToken error:', fallbackError);
      return null;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Store the FCM/Expo push token in Firestore under users/{userId}
// @param {string} userId - Firebase Auth user ID
// @param {string} token  - Expo push token string
// @returns {Promise<void>}
// ─────────────────────────────────────────────────────────────────────────────
export async function storeFCMToken(userId, token) {
  console.log('[notifications] storeFCMToken start', { userId, token: token?.slice(0, 20) + '...' });

  if (!userId) {
    console.warn('[notifications] storeFCMToken: userId is required, skipping');
    return;
  }

  if (!token) {
    console.warn('[notifications] storeFCMToken: token is null, skipping');
    return;
  }

  try {
    const userDocRef = doc(db, 'users', userId);
    await updateDoc(userDocRef, {
      fcmToken: token,
      fcmTokenUpdatedAt: new Date().toISOString(),
      platform: Platform.OS,
    });
    console.log('[notifications] FCM token stored in Firestore successfully');
  } catch (error) {
    console.error('[notifications] storeFCMToken error:', error);
    // Don't rethrow — token storage failure shouldn't crash the app
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Listen for token refresh events and update Firestore automatically
// @param {string} userId - Firebase Auth user ID
// @returns {Function} Cleanup function to remove the listener
// ─────────────────────────────────────────────────────────────────────────────
export function setupTokenRefreshListener(userId) {
  console.log('[notifications] setupTokenRefreshListener start', { userId });

  if (!userId) {
    console.warn('[notifications] setupTokenRefreshListener: userId is required');
    return () => {};
  }

  const subscription = Notifications.addPushTokenListener(async (newToken) => {
    console.log('[notifications] Push token refreshed:', newToken.data?.slice(0, 20) + '...');
    await storeFCMToken(userId, newToken.data);
  });

  console.log('[notifications] Token refresh listener active');

  // Return cleanup function
  return () => {
    console.log('[notifications] Removing token refresh listener');
    subscription.remove();
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Set up a handler for notifications received while the app is in foreground.
// expo-notifications setNotificationHandler (top of file) already shows banners;
// this listener can be used for additional in-app custom handling if needed.
// @returns {Function} Cleanup function to remove the listener
// ─────────────────────────────────────────────────────────────────────────────
export function setupForegroundNotificationHandler() {
  console.log('[notifications] setupForegroundNotificationHandler start');

  const subscription = Notifications.addNotificationReceivedListener((notification) => {
    console.log('[notifications] Foreground notification received:', {
      title: notification.request.content.title,
      body: notification.request.content.body,
      data: notification.request.content.data,
    });
    // The notification handler at the top of this file handles showing the banner.
    // Add any additional in-app handling here if needed (e.g., refresh alert list).
  });

  return () => {
    console.log('[notifications] Removing foreground notification listener');
    subscription.remove();
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Extract navigation target from a notification tap response
// @param {Object} response - Notifications.NotificationResponse object
// @returns {{ screen: string, params: Object } | null}
// ─────────────────────────────────────────────────────────────────────────────
export function getNotificationNavTarget(response) {
  try {
    const data = response?.notification?.request?.content?.data;

    if (!data) {
      console.warn('[notifications] getNotificationNavTarget: no data in notification');
      return null;
    }

    const screen = data.screen;
    const userId = data.userId;

    if (!screen || !userId) {
      console.warn('[notifications] getNotificationNavTarget: missing screen or userId', data);
      return null;
    }

    console.log('[notifications] Notification nav target:', { screen, userId });
    return { screen, params: { userId } };
  } catch (error) {
    console.error('[notifications] getNotificationNavTarget error:', error);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Full initialization: request permission → get token → store token
// Call this once on app startup after the user is authenticated.
// @param {string} userId - Firebase Auth user ID
// @returns {Promise<{ success: boolean, token: string|null, message: string|null }>}
// ─────────────────────────────────────────────────────────────────────────────
export async function initializeNotifications(userId) {
  console.log('[notifications] initializeNotifications start', { userId });

  try {
    // Step 1: Request permission
    const permissionResult = await requestNotificationPermission();
    if (!permissionResult.granted) {
      return {
        success: false,
        token: null,
        message: permissionResult.message || 'Notification permission not granted',
      };
    }

    // Step 2: Get token
    const token = await getExpoPushToken();
    if (!token) {
      return {
        success: false,
        token: null,
        message: 'Could not retrieve push token from this device.',
      };
    }

    // Step 3: Store token
    await storeFCMToken(userId, token);

    console.log('[notifications] initializeNotifications complete');
    return { success: true, token, message: null };
  } catch (error) {
    console.error('[notifications] initializeNotifications error:', error);
    return {
      success: false,
      token: null,
      message: 'Failed to initialize notifications.',
    };
  }
}
