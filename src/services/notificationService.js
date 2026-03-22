import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

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
    console.log('[notificationService] Android emergency notification channel configured');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Register and Get Push Token
// ─────────────────────────────────────────────────────────────────────────────
export async function registerForPushNotifications(userId) {
  try {
    if (!Device.isDevice) {
      console.warn('[notificationService] Emulators do not support push notifications.');
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
          allowCriticalAlerts: true, // Try to allow critical alerts on iOS mapping
        },
      });
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('[notificationService] Notification permission not granted');
      return false;
    }

    // Get the Expo Push Token. Note: Using current proj ID or fall back.
    let tokenData;
    try {
      tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: '60d17df5-f61e-4c96-951f-ebd84c5c8f16',
      });
    } catch (err) {
      tokenData = await Notifications.getExpoPushTokenAsync();
    }

    const token = tokenData.data;
    console.log('[notificationService] Got push token:', token);

    // Save token to Firestore
    if (userId && token) {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        fcmToken: token,
        fcmTokenUpdatedAt: new Date().toISOString(),
        platform: Platform.OS,
      });
      console.log('[notificationService] Token securely stored in Firestore');
    }

    return token;
  } catch (error) {
    console.error('[notificationService] registerForPushNotifications error:', error);
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
      console.log('[notificationService] Push token dynamically updated');
    } catch (err) {
      console.error('[notificationService] Failed to update refreshed token:', err);
    }
  });

  return () => sub.remove();
}

// ─────────────────────────────────────────────────────────────────────────────
// Foreground Notification Event (Haptics)
// ─────────────────────────────────────────────────────────────────────────────
export function setupForegroundNotificationHandler() {
  const sub = Notifications.addNotificationReceivedListener((notification) => {
    console.log('[notificationService] Foreground alert received');
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
    const targetScreen = data.alertType === 'SOS' ? 'UserLocationMap' : (data.screen || null);
    
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
    console.error('[notificationService] handleNotificationNavigation error:', err);
    return null;
  }
}
