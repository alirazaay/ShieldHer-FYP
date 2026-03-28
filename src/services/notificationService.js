import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import Constants from 'expo-constants';
import { db } from '../config/firebase';
import logger from '../utils/logger';

const TAG = '[notificationService]';

// Get Expo project ID from config
const expoConfig = Constants.expoConfig?.extra || Constants.manifest?.extra || {};
const EXPO_PROJECT_ID = expoConfig.expoProjectId;

// ─────────────────────────────────────────────────────────────────────────────
// Foreground Banner Behavior
// ─────────────────────────────────────────────────────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Configure Android Emergency Channel
// ─────────────────────────────────────────────────────────────────────────────
export async function configureNotificationChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('emergency-alerts', {
      name: 'Emergency Alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500],
      lightColor: '#E01111',
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true, // Allow emergency alerts through Do Not Disturb
    });
    logger.info(TAG, 'Android emergency notification channel configured');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Register and Get Push Token
// ─────────────────────────────────────────────────────────────────────────────
export async function registerForPushNotifications(userId) {
  try {
    if (!Device.isDevice) {
      logger.warn(TAG, 'Emulators do not support push notifications.');
      return false;
    }

    // Configure the Android channel strictly before getting a token
    await configureNotificationChannel();

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowCriticalAlerts: true,
        },
      });
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      logger.warn(TAG, 'Notification permission not granted');
      return false;
    }

    // Get the Expo Push Token using project ID from config
    let tokenData;
    try {
      tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: EXPO_PROJECT_ID,
      });
    } catch {
      tokenData = await Notifications.getExpoPushTokenAsync();
    }

    const token = tokenData.data;
    logger.info(TAG, 'Got push token:', token?.slice(0, 30) + '...');

    // Save token to Firestore
    if (userId && token) {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        fcmToken: token,
        fcmTokenUpdatedAt: new Date().toISOString(),
        platform: Platform.OS,
      });
      logger.info(TAG, 'Token securely stored in Firestore');
    }

    return token;
  } catch (error) {
    logger.error(TAG, 'registerForPushNotifications error:', error);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Refresh Token Listener
// ─────────────────────────────────────────────────────────────────────────────
export function setupTokenRefreshListener(userId) {
  if (!userId) return () => {};

  const sub = Notifications.addPushTokenListener(async (newToken) => {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        fcmToken: newToken.data,
        fcmTokenUpdatedAt: new Date().toISOString(),
      });
      logger.info(TAG, 'Push token dynamically updated');
    } catch (err) {
      logger.error(TAG, 'Failed to update refreshed token:', err);
    }
  });

  return () => sub.remove();
}

// ─────────────────────────────────────────────────────────────────────────────
// Foreground Notification Event (Haptics)
// ─────────────────────────────────────────────────────────────────────────────
export function setupForegroundNotificationHandler() {
  const sub = Notifications.addNotificationReceivedListener((_notification) => {
    logger.debug(TAG, 'Foreground alert received');
    // Vibrate heavily if the user receives an alert while looking at the app
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  });
  return () => sub.remove();
}

// ─────────────────────────────────────────────────────────────────────────────
// Parse Target and Route (Navigation)
// ─────────────────────────────────────────────────────────────────────────────
export function handleNotificationNavigation(response) {
  try {
    const data = response?.notification?.request?.content?.data;
    if (!data) return null;

    // Use UserLocationMapScreen specifically when an emergency alert is tapped
    // Fall back to original screen extraction logic if something else is sent
    const targetScreen = data.alertType === 'SOS' ? 'UserLocationMap' : data.screen || null;

    if (targetScreen) {
      return {
        screen: targetScreen,
        params: {
          userId: data.userId,
          alertId: data.alertId,
        },
      };
    }
    return null;
  } catch (err) {
    logger.error(TAG, 'handleNotificationNavigation error:', err);
    return null;
  }
}
