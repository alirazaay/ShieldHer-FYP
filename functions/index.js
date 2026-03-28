/* eslint-disable max-len */
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const axios = require('axios');

// Escalation service for police dashboard
const { scheduleEscalation } = require('./escalationService');

// Initialize Firebase Admin SDK
initializeApp();
const db = getFirestore();
const adminAuth = getAuth();

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
// OTP AUTHENTICATION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const OTP_EXPIRY_SECONDS = 300; // 5 minutes
const OTP_MAX_ATTEMPTS = 5;     // Max verify attempts per code
const OTP_RATE_LIMIT = 5;       // Max OTP requests per phone per hour

/**
 * Generate a cryptographically random 6-digit OTP
 * @returns {string} 6-digit OTP code
 */
function generateOTP() {
  const crypto = require('crypto');
  const num = crypto.randomInt(100000, 999999);
  return num.toString();
}

/**
 * Hash a phone number for Firestore document ID (to avoid special chars)
 * @param {string} phone - Phone number
 * @returns {string} Hashed phone for doc ID
 */
function hashPhone(phone) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(phone).digest('hex').slice(0, 20);
}

// ─────────────────────────────────────────────────────────────────────────────
// CLOUD FUNCTION: sendOTP
// HTTP endpoint that generates an OTP, stores it in Firestore, and sends via SMS
// ─────────────────────────────────────────────────────────────────────────────
exports.sendOTP = onRequest(
  { region: 'us-central1', cors: true },
  async (req, res) => {
    // Only allow POST
    if (req.method !== 'POST') {
      return res.status(405).json({ code: 'method-not-allowed', message: 'Only POST is allowed' });
    }

    const { phoneNumber } = req.body;

    if (!phoneNumber || typeof phoneNumber !== 'string' || phoneNumber.length < 10) {
      return res.status(400).json({
        code: 'validation/invalid-phone',
        message: 'A valid phone number is required',
      });
    }

    const phoneHash = hashPhone(phoneNumber);
    const otpDocRef = db.collection('otpCodes').doc(phoneHash);

    try {
      // ── Rate limiting ─────────────────────────────────────────────────
      const existingDoc = await otpDocRef.get();
      if (existingDoc.exists) {
        const data = existingDoc.data();
        const now = Date.now();
        const lastSentAt = data.lastSentAt?.toMillis?.() || data.lastSentAt || 0;

        // Check hourly rate limit
        if (data.hourlyCount >= OTP_RATE_LIMIT && now - lastSentAt < 3600000) {
          return res.status(429).json({
            code: 'otp/rate-limited',
            message: 'Too many OTP requests. Please wait before trying again.',
          });
        }

        // Reset hourly count if more than an hour has passed
        if (now - lastSentAt >= 3600000) {
          // Will be reset below
        }
      }

      // ── Generate OTP ──────────────────────────────────────────────────
      const otpCode = generateOTP();
      const expiresAt = new Date(Date.now() + OTP_EXPIRY_SECONDS * 1000);

      // Store OTP in Firestore
      const hourlyCount = existingDoc.exists
        ? (Date.now() - (existingDoc.data().lastSentAt?.toMillis?.() || 0) >= 3600000
          ? 1
          : (existingDoc.data().hourlyCount || 0) + 1)
        : 1;

      await otpDocRef.set({
        phoneNumber,
        code: otpCode,
        expiresAt,
        attempts: 0,
        hourlyCount,
        lastSentAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      });

      // ── Send SMS via Twilio ───────────────────────────────────────────
      // Twilio credentials should be set via Firebase Functions config:
      // firebase functions:config:set twilio.sid="xxx" twilio.token="xxx" twilio.phone="+1xxx"
      const twilioConfig = {
        accountSid: process.env.TWILIO_ACCOUNT_SID || '',
        authToken: process.env.TWILIO_AUTH_TOKEN || '',
        fromPhone: process.env.TWILIO_PHONE_NUMBER || '',
      };

      if (twilioConfig.accountSid && twilioConfig.authToken && twilioConfig.fromPhone) {
        try {
          const twilio = require('twilio');
          const client = twilio(twilioConfig.accountSid, twilioConfig.authToken);

          await client.messages.create({
            body: `ShieldHer: Your verification code is ${otpCode}. It expires in 5 minutes. Do not share this code.`,
            from: twilioConfig.fromPhone,
            to: phoneNumber,
          });

          console.log(`[sendOTP] SMS sent to ${phoneNumber.slice(0, 5)}***`);
        } catch (smsError) {
          console.error('[sendOTP] Twilio SMS error:', smsError.message);
          // Continue – OTP is stored, user can still verify (for dev/testing)
        }
      } else {
        // Development mode: log OTP to console when Twilio is not configured
        console.log(`[sendOTP] ⚠️ Twilio not configured. OTP for ${phoneNumber}: ${otpCode}`);
      }

      return res.status(200).json({
        success: true,
        message: 'Verification code sent',
        expiresIn: OTP_EXPIRY_SECONDS,
      });
    } catch (error) {
      console.error('[sendOTP] Error:', error);
      return res.status(500).json({
        code: 'otp/send-failed',
        message: 'Failed to send verification code. Please try again.',
      });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// CLOUD FUNCTION: verifyOTP
// HTTP endpoint that validates an OTP and returns a Firebase custom token
// ─────────────────────────────────────────────────────────────────────────────
exports.verifyOTP = onRequest(
  { region: 'us-central1', cors: true },
  async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).json({ code: 'method-not-allowed', message: 'Only POST is allowed' });
    }

    const { phoneNumber, code } = req.body;

    if (!phoneNumber || !code || code.length !== 6) {
      return res.status(400).json({
        code: 'validation/invalid-input',
        message: 'Phone number and 6-digit code are required',
      });
    }

    const phoneHash = hashPhone(phoneNumber);
    const otpDocRef = db.collection('otpCodes').doc(phoneHash);

    try {
      const otpDoc = await otpDocRef.get();

      if (!otpDoc.exists) {
        return res.status(400).json({
          code: 'otp/not-found',
          message: 'No OTP was sent to this number. Please request a new code.',
        });
      }

      const otpData = otpDoc.data();

      // Check expiry
      const expiresAt = otpData.expiresAt?.toMillis?.() || otpData.expiresAt?.getTime?.() || 0;
      if (Date.now() > expiresAt) {
        await otpDocRef.delete();
        return res.status(400).json({
          code: 'otp/expired',
          message: 'OTP has expired. Please request a new code.',
        });
      }

      // Check attempts
      if (otpData.attempts >= OTP_MAX_ATTEMPTS) {
        await otpDocRef.delete();
        return res.status(400).json({
          code: 'otp/max-attempts',
          message: 'Too many failed attempts. Please request a new code.',
        });
      }

      // Verify code
      if (otpData.code !== code) {
        // Increment attempts
        await otpDocRef.update({ attempts: FieldValue.increment(1) });
        const remaining = OTP_MAX_ATTEMPTS - otpData.attempts - 1;
        return res.status(400).json({
          code: 'otp/invalid-code',
          message: `Invalid code. ${remaining} attempt(s) remaining.`,
        });
      }

      // ── OTP is valid – Clean up and create/get user ───────────────────
      await otpDocRef.delete();

      // Find or create Firebase Auth user by phone number
      let userRecord;
      let isNewUser = false;

      try {
        userRecord = await adminAuth.getUserByPhoneNumber(phoneNumber);
        console.log(`[verifyOTP] Existing user found: ${userRecord.uid}`);
      } catch (err) {
        if (err.code === 'auth/user-not-found') {
          // Create new Firebase Auth user
          userRecord = await adminAuth.createUser({
            phoneNumber: phoneNumber,
          });
          isNewUser = true;
          console.log(`[verifyOTP] New user created: ${userRecord.uid}`);
        } else {
          throw err;
        }
      }

      // ── Mint a custom token for client-side sign-in ───────────────────
      const customToken = await adminAuth.createCustomToken(userRecord.uid);

      return res.status(200).json({
        success: true,
        customToken,
        isNewUser,
        uid: userRecord.uid,
      });
    } catch (error) {
      console.error('[verifyOTP] Error:', error);
      return res.status(500).json({
        code: 'otp/verify-failed',
        message: 'Verification failed. Please try again.',
      });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// CLOUD FUNCTION: onAlertCreated
// Triggers whenever a new document is created in the `alerts` Firestore collection.
// Reads the alert, finds the user's guardians, fetches their FCM tokens,
// and sends a push notification to each one.
// Also triggers escalation timer for police dashboard.
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
      // Still schedule escalation even with no guardians
      scheduleEscalation(alertId, alertData, db, sendExpoPushNotifications);
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
      // Still schedule escalation
      scheduleEscalation(alertId, alertData, db, sendExpoPushNotifications);
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

      // ── Schedule escalation to authorities ──────────────────────────────
      // This runs asynchronously — Cloud Function completes while escalation waits
      scheduleEscalation(alertId, alertData, db, sendExpoPushNotifications);

      return result;
    } catch (err) {
      console.error('[onAlertCreated] Error sending push notifications:', err?.message || err);
      // Still schedule escalation
      scheduleEscalation(alertId, alertData, db, sendExpoPushNotifications);
      return null;
    }
  }
);
