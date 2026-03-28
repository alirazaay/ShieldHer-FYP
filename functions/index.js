/* eslint-disable max-len */
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const axios = require('axios');

// Initialize Firebase Admin SDK
initializeApp();
const db = getFirestore();

// ─────────────────────────────────────────────────────────────────────────────
// EXPO PUSH NOTIFICATION HELPER
// Sends push notifications through Expo's push service.
// Expo's service handles delivery to both FCM (Android) and APNs (iOS).
// Docs: https://docs.expo.dev/push-notifications/sending-notifications
// ─────────────────────────────────────────────────────────────────────────────

const EXPO_PUSH_API = 'https://exp.host/--/push/v2/send';

/**
 * Send push notifications to multiple Expo push tokens.
 * @param {Array<string>} tokens - Array of Expo push token strings
 * @param {string} title        - Notification title
 * @param {string} body         - Notification body text
 * @param {Object} data         - Custom data payload (for deep linking)
 * @returns {Promise<Object>}   - Expo push API response
 */
async function sendExpoPushNotifications(tokens, title, body, data = {}) {
  if (!tokens || tokens.length === 0) {
    console.warn('[sendExpoPushNotifications] No tokens provided, skipping');
    return null;
  }

  // Filter valid Expo push tokens (must start with ExponentPushToken)
  const validTokens = tokens.filter(
    (token) => typeof token === 'string' && token.startsWith('ExponentPushToken')
  );

  if (validTokens.length === 0) {
    console.warn('[sendExpoPushNotifications] No valid Expo push tokens found among:', tokens);
    return null;
  }

  // Build one message per token (Expo recommends individual messages for
  // better per-device error reporting)
  const messages = validTokens.map((token) => ({
    to: token,
    title,
    body,
    data,
    sound: 'default',
    priority: 'high',
    badge: 1,
    channelId: 'emergency-alerts', // Upgraded to critical emergency alerts channel
  }));

  console.log(`[sendExpoPushNotifications] Sending ${messages.length} notifications...`);

  const response = await axios.post(EXPO_PUSH_API, messages, {
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    timeout: 10000, // 10 second timeout
  });

  console.log('[sendExpoPushNotifications] Response:', JSON.stringify(response.data));

  // Log any per-ticket errors
  if (response.data && response.data.data) {
    response.data.data.forEach((ticket, idx) => {
      if (ticket.status === 'error') {
        console.error(
          `[sendExpoPushNotifications] Token error for index ${idx}:`,
          ticket.message,
          ticket.details
        );
      }
    });
  }

  return response.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLOUD FUNCTION: onAlertCreated
// Triggers whenever a new document is created in the `alerts` Firestore collection.
// Reads the alert, finds the user's guardians, fetches their FCM tokens,
// and sends a push notification to each one.
// ─────────────────────────────────────────────────────────────────────────────
exports.onAlertCreated = onDocumentCreated(
  {
    document: 'alerts/{alertId}',
    region: 'us-central1',
  },
  async (event) => {
    const alertId = event.params.alertId;
    const alertData = event.data?.data();

    console.log(`[onAlertCreated] Triggered for alert: ${alertId}`);
    console.log('[onAlertCreated] Alert data:', JSON.stringify(alertData));

    // ── Validate alert data ──────────────────────────────────────────────────
    if (!alertData) {
      console.error('[onAlertCreated] No alert data found, aborting');
      return null;
    }

    const { userId, alertType, latitude, longitude } = alertData;

    if (!userId) {
      console.error('[onAlertCreated] userId missing from alert, aborting');
      return null;
    }

    // Only process SOS alerts
    if (alertType && alertType !== 'SOS') {
      console.log(`[onAlertCreated] Non-SOS alert type "${alertType}", skipping`);
      return null;
    }

    // ── Fetch user profile ───────────────────────────────────────────────────
    let userName = 'A user';
    try {
      const userDoc = await db.collection('users').doc(userId).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        userName = userData.fullName || userData.email || 'A user';
        console.log(`[onAlertCreated] Alert from user: ${userName} (${userId})`);
      } else {
        console.warn('[onAlertCreated] User doc not found for userId:', userId);
      }
    } catch (err) {
      console.error('[onAlertCreated] Error fetching user profile:', err);
      // Continue — we can still send notifications with a generic name
    }

    // ── Fetch user's guardians subcollection ─────────────────────────────────
    let guardians = [];
    try {
      const guardiansSnap = await db
        .collection('users')
        .doc(userId)
        .collection('guardians')
        .get();

      guardians = guardiansSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      console.log(`[onAlertCreated] Found ${guardians.length} guardian(s) for user ${userId}`);
    } catch (err) {
      console.error('[onAlertCreated] Error fetching guardians:', err);
      return null;
    }

    if (guardians.length === 0) {
      console.warn('[onAlertCreated] No guardians found, no notifications to send');
      return null;
    }

    // ── Fetch each guardian's FCM token from their user document ─────────────
    // For guardians added via invite flow: doc ID = guardian's UID (can fetch token)
    // For guardians added manually: doc ID = random ID (no token available)
    const tokenFetchPromises = guardians.map(async (guardian) => {
      if (!guardian.id) {
        console.warn('[onAlertCreated] Guardian has no ID, skipping');
        return null;
      }

      // Skip non-registered guardians (manual additions without app account)
      // They have random doc IDs and won't have FCM tokens anyway
      if (guardian.isRegisteredUser === false) {
        console.log(`[onAlertCreated] Guardian ${guardian.name || guardian.id} is not a registered user, skipping notification`);
        return null;
      }

      try {
        // Guardian doc ID should be the guardian's UID for registered users
        const guardianDoc = await db.collection('users').doc(guardian.id).get();
        if (!guardianDoc.exists) {
          console.warn(`[onAlertCreated] Guardian user doc not found: ${guardian.id} (may be a manual addition)`);
          return null;
        }

        const token = guardianDoc.data()?.fcmToken;
        if (!token) {
          console.warn(`[onAlertCreated] No FCM token for guardian ${guardian.id}`);
          return null;
        }

        console.log(`[onAlertCreated] Got token for guardian ${guardian.id}`);
        return token;
      } catch (err) {
        console.error(`[onAlertCreated] Error fetching token for guardian ${guardian.id}:`, err);
        return null;
      }
    });

    const tokenResults = await Promise.all(tokenFetchPromises);

    // Filter out nulls
    const validTokens = tokenResults.filter(Boolean);
    console.log(`[onAlertCreated] Valid tokens collected: ${validTokens.length}`);

    if (validTokens.length === 0) {
      console.warn('[onAlertCreated] No valid FCM tokens found among guardians, aborting');
      return null;
    }

    // ── Build location hint for notification body ─────────────────────────────
    let locationHint = '';
    if (latitude && longitude) {
      locationHint = ` (${parseFloat(latitude).toFixed(4)}, ${parseFloat(longitude).toFixed(4)})`;
    }

    // ── Send push notifications ───────────────────────────────────────────────
    const notificationTitle = '🚨 Emergency SOS Alert';
    const notificationBody = `${userName} has triggered an SOS alert! Tap to view their live location.`;

    // Data payload — used by the app's notification tap handler to deep-link
    const notificationData = {
      screen: 'UserLocationMap',  // matches Stack.Screen name in App.js
      userId: userId,
      alertId: alertId,
      alertType: 'SOS',
    };

    try {
      const result = await sendExpoPushNotifications(
        validTokens,
        notificationTitle,
        notificationBody,
        notificationData
      );

      console.log(
        `[onAlertCreated] ✅ SOS notifications sent to ${validTokens.length} guardian(s) for alert ${alertId}`
      );
      return result;
    } catch (err) {
      console.error('[onAlertCreated] Error sending push notifications:', err?.message || err);
      // Don't rethrow — function should complete even if notification send fails
      return null;
    }
  }
);
