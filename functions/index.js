/* eslint-disable max-len */
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { getMessaging } = require('firebase-admin/messaging');
const axios = require('axios');

// Escalation service for police workflow
const { enqueueEscalation, processDueEscalations } = require('./escalationService');

// Initialize Firebase Admin SDK
initializeApp();
const db = getFirestore();
const adminAuth = getAuth();

const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const LONG_DIGIT_REGEX = /\+?\d[\d\s-]{7,}\d/g;

function sanitizeSensitiveText(value) {
  return String(value)
    .replace(EMAIL_REGEX, '[REDACTED]')
    .replace(LONG_DIGIT_REGEX, (match) => {
      const digits = match.replace(/\D/g, '');
      return digits.length >= 10 ? '[REDACTED]' : match;
    });
}

function safeErrorMessage(error) {
  if (!error) return 'unknown-error';
  return sanitizeSensitiveText(error.message || String(error));
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPO PUSH NOTIFICATION HELPER
// Sends push notifications through Expo's push service.
// Expo's service handles delivery to both FCM (Android) and APNs (iOS).
// Docs: https://docs.expo.dev/push-notifications/sending-notifications
// ─────────────────────────────────────────────────────────────────────────────

const EXPO_PUSH_API = 'https://exp.host/--/push/v2/send';
const SOS_PUSH_TITLE = '🚨 Emergency SOS Alert';
const SOS_SMS_FALLBACK_DELAY_MS =
  process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID != null
    ? 0
    : Number.isFinite(Number(process.env.SOS_SMS_FALLBACK_DELAY_MS))
      ? Number(process.env.SOS_SMS_FALLBACK_DELAY_MS)
      : 8000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function buildMapsLink(latitude, longitude) {
  if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
    return null;
  }

  return `https://maps.google.com/?q=${Number(latitude)},${Number(longitude)}`;
}

function buildEmergencyDataPayload({
  alertId,
  userId,
  userName,
  latitude,
  longitude,
  triggerType,
  inboxDocId,
}) {
  const mapsLink = buildMapsLink(latitude, longitude);

  return {
    eventType: 'SOS_CALL',
    alertType: 'SOS',
    alertId,
    userId,
    userName,
    screen: 'UserLocationMap',
    triggerType: triggerType || 'manual',
    locationLink: mapsLink || '',
    latitude: Number.isFinite(Number(latitude)) ? String(latitude) : '',
    longitude: Number.isFinite(Number(longitude)) ? String(longitude) : '',
    inboxDocId: inboxDocId || '',
    urgency: 'critical',
  };
}

function buildEmergencyBody(userName, mapsLink) {
  const who = userName || 'A ShieldHer user';
  if (!mapsLink) {
    return `${who} triggered an emergency SOS. Open ShieldHer now.`;
  }
  return `${who} triggered an emergency SOS. Live location: ${mapsLink}`;
}

function isExpoToken(token) {
  return typeof token === 'string' && token.startsWith('ExponentPushToken');
}

function hasTwilioConfig() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_PHONE_NUMBER
  );
}

async function sendHighPriorityFcm(tokens, payload) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return null;
  }

  const cleanTokens = tokens.filter((token) => typeof token === 'string' && !isExpoToken(token));
  if (cleanTokens.length === 0) {
    return null;
  }

  const mapsLink = payload.locationLink || '';
  const body = buildEmergencyBody(payload.userName, mapsLink);

  const message = {
    tokens: cleanTokens,
    notification: {
      title: SOS_PUSH_TITLE,
      body,
    },
    data: Object.entries(payload).reduce((acc, [key, value]) => {
      acc[key] = value == null ? '' : String(value);
      return acc;
    }, {}),
    android: {
      priority: 'high',
      ttl: 3600 * 1000,
      notification: {
        channelId: 'emergency-alerts',
        priority: 'max',
        defaultVibrateTimings: true,
        defaultSound: true,
        visibility: 'public',
      },
    },
  };

  try {
    const messaging = getMessaging();
    const response = await messaging.sendEachForMulticast(message);

    if (response.failureCount > 0) {
      response.responses.forEach((res, index) => {
        if (!res.success) {
          console.warn(
            `[sendHighPriorityFcm] Token delivery failed (index=${index}): ${safeErrorMessage(
              res.error
            )}`
          );
        }
      });
    }

    console.log(
      `[sendHighPriorityFcm] Sent=${response.successCount}, Failed=${response.failureCount}`
    );

    return response;
  } catch (error) {
    console.error(`[sendHighPriorityFcm] Error: ${safeErrorMessage(error)}`);
    return null;
  }
}

function formatEmergencySms({ userName, mapsLink, triggerType }) {
  const who = userName || 'ShieldHer user';
  const mode = triggerType === 'AI' ? 'AI scream detection' : 'manual SOS';
  const locationPart = mapsLink ? `Location: ${mapsLink}` : 'Location unavailable';
  return `SOS ALERT from ShieldHer. ${who} triggered ${mode}. ${locationPart}`;
}

async function sendEmergencySmsViaTwilio({ toPhone, userName, mapsLink, triggerType }) {
  if (!toPhone || !hasTwilioConfig()) {
    return false;
  }

  try {
    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({
      body: formatEmergencySms({ userName, mapsLink, triggerType }),
      from: process.env.TWILIO_PHONE_NUMBER,
      to: toPhone,
    });

    return true;
  } catch (error) {
    console.error(`[sendEmergencySmsViaTwilio] Error: ${safeErrorMessage(error)}`);
    return false;
  }
}

async function executeSmsFallbackForPendingDeliveries(alertId, guardianTargets) {
  if (!Array.isArray(guardianTargets) || guardianTargets.length === 0) {
    return;
  }

  await sleep(SOS_SMS_FALLBACK_DELAY_MS);

  for (const target of guardianTargets) {
    const deliveryRef = db.collection('guardianAlertInbox').doc(target.deliveryId);
    let deliveryData = null;

    try {
      const deliverySnap = await deliveryRef.get();
      if (!deliverySnap.exists) {
        continue;
      }

      deliveryData = deliverySnap.data() || {};
      const isAcked = Boolean(deliveryData.pushAckAt || deliveryData.callAcceptedAt);
      const wasSmsSent = Boolean(deliveryData.smsFallbackSent);

      if (isAcked || wasSmsSent) {
        continue;
      }
    } catch (error) {
      console.error(
        `[executeSmsFallbackForPendingDeliveries] Fetch failed: ${safeErrorMessage(error)}`
      );
      continue;
    }

    const mapsLink = deliveryData.mapsLink || buildMapsLink(target.latitude, target.longitude);
    const sent = await sendEmergencySmsViaTwilio({
      toPhone: target.guardianPhone,
      userName: target.userName,
      mapsLink,
      triggerType: target.triggerType,
    });

    if (!sent) {
      continue;
    }

    try {
      await deliveryRef.set(
        {
          smsFallbackSent: true,
          smsFallbackAt: FieldValue.serverTimestamp(),
          status: 'sms_fallback',
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch (updateError) {
      console.error(
        `[executeSmsFallbackForPendingDeliveries] Update failed: ${safeErrorMessage(updateError)}`
      );
    }
  }
}

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
    console.warn(
      `[sendExpoPushNotifications] No valid Expo push tokens found (inputCount=${tokens.length})`
    );
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

  console.log(
    `[sendExpoPushNotifications] Response received (ticketCount=${response?.data?.data?.length || 0})`
  );

  // Log any per-ticket errors
  if (response.data && response.data.data) {
    response.data.data.forEach((ticket, idx) => {
      if (ticket.status === 'error') {
        console.error(
          `[sendExpoPushNotifications] Token error for index ${idx}: ${ticket.message || 'unknown-error'}`
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
const E164_REGEX = /^\+[1-9]\d{9,14}$/;

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
 * Normalize to an E.164-like phone format.
 * @param {string} phone
 * @returns {string|null}
 */
function normalizePhoneNumber(phone) {
  if (typeof phone !== 'string') return null;

  let normalized = phone.trim();
  if (!normalized) return null;

  normalized = normalized.replace(/[\s()-]/g, '');

  if (normalized.startsWith('00')) {
    normalized = `+${normalized.slice(2)}`;
  }

  if (!normalized.startsWith('+')) {
    normalized = `+${normalized}`;
  }

  normalized = `+${normalized.slice(1).replace(/\D/g, '')}`;

  if (!E164_REGEX.test(normalized)) {
    return null;
  }

  return normalized;
}

/**
 * Mask phone for server logs.
 * @param {string} phone
 * @returns {string}
 */
function maskPhone(phone) {
  const normalized = normalizePhoneNumber(phone);
  if (!normalized) return '***';
  return `${normalized.slice(0, 5)}***${normalized.slice(-2)}`;
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

/**
 * Hash OTP with phone-specific salt for secure-at-rest storage.
 * @param {string} phoneHash - Hashed phone identifier
 * @param {string} otpCode - Raw OTP code
 * @returns {string}
 */
function hashOTP(phoneHash, otpCode) {
  const crypto = require('crypto');
  return crypto
    .createHash('sha256')
    .update(`${phoneHash}:${otpCode}`)
    .digest('hex');
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

    const normalizedPhoneNumber = normalizePhoneNumber(req.body?.phoneNumber);

    if (!normalizedPhoneNumber) {
      return res.status(400).json({
        code: 'validation/invalid-phone',
        message: 'A valid phone number is required',
      });
    }

    const phoneHash = hashPhone(normalizedPhoneNumber);
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
        phoneNumber: normalizedPhoneNumber,
        codeHash: hashOTP(phoneHash, otpCode),
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
            to: normalizedPhoneNumber,
          });

          console.log(`[sendOTP] SMS sent to ${maskPhone(normalizedPhoneNumber)}`);
        } catch (smsError) {
          console.error(`[sendOTP] Twilio SMS error: ${safeErrorMessage(smsError)}`);
          // Continue – OTP is stored, user can still verify (for dev/testing)
        }
      } else {
        // Development mode note without logging sensitive OTP values
        console.log(
          `[sendOTP] ⚠️ Twilio not configured. OTP generated for ${maskPhone(normalizedPhoneNumber)}`
        );
      }

      return res.status(200).json({
        success: true,
        message: 'Verification code sent',
        expiresIn: OTP_EXPIRY_SECONDS,
      });
    } catch (error) {
      console.error(`[sendOTP] Error: ${safeErrorMessage(error)}`);
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

    const normalizedPhoneNumber = normalizePhoneNumber(req.body?.phoneNumber);
    const code = String(req.body?.code || '').trim();

    if (!normalizedPhoneNumber || !/^\d{6}$/.test(code)) {
      return res.status(400).json({
        code: 'validation/invalid-input',
        message: 'Phone number and 6-digit code are required',
      });
    }

    const phoneHash = hashPhone(normalizedPhoneNumber);
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
      const attempts = Number(otpData.attempts || 0);

      if (attempts >= OTP_MAX_ATTEMPTS) {
        await otpDocRef.delete();
        return res.status(400).json({
          code: 'otp/max-attempts',
          message: 'Too many failed attempts. Please request a new code.',
        });
      }

      // Verify code (secure hash compare with backward compatibility fallback)
      let isCodeValid = false;
      if (otpData.codeHash) {
        const crypto = require('crypto');
        const providedHash = hashOTP(phoneHash, code);
        const storedHash = String(otpData.codeHash);
        const providedBuf = Buffer.from(providedHash);
        const storedBuf = Buffer.from(storedHash);
        isCodeValid =
          storedBuf.length === providedBuf.length &&
          crypto.timingSafeEqual(storedBuf, providedBuf);
      } else {
        // Legacy fallback for previously stored plaintext OTP docs
        isCodeValid = otpData.code === code;
      }

      if (!isCodeValid) {
        // Increment attempts
        await otpDocRef.update({ attempts: FieldValue.increment(1) });
        const remaining = OTP_MAX_ATTEMPTS - attempts - 1;
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
        userRecord = await adminAuth.getUserByPhoneNumber(normalizedPhoneNumber);
        console.log('[verifyOTP] Existing user found');
      } catch (err) {
        if (err.code === 'auth/user-not-found') {
          // Create new Firebase Auth user
          userRecord = await adminAuth.createUser({
            phoneNumber: normalizedPhoneNumber,
          });
          isNewUser = true;
          console.log('[verifyOTP] New user created');
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
      console.error(`[verifyOTP] Error: ${safeErrorMessage(error)}`);
      return res.status(500).json({
        code: 'otp/verify-failed',
        message: 'Verification failed. Please try again.',
      });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// CLOUD FUNCTION: onGuardianInviteAccepted
// When invite status changes to "accepted", securely creates bidirectional
// relationships:
// - users/{userId}/guardians/{guardianUid}
// - users/{guardianUid}/connectedUsers/{userId}
// Then removes the invite document.
// ─────────────────────────────────────────────────────────────────────────────
exports.onGuardianInviteAccepted = onDocumentUpdated(
  {
    document: 'guardianInvites/{inviteId}',
    region: 'us-central1',
  },
  async (event) => {
    const inviteId = event.params.inviteId;
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();

    if (!before || !after) return null;

    // Only react when invite transitions to accepted
    if (before.status === after.status || after.status !== 'accepted') {
      return null;
    }

    const {
      userId,
      userEmail,
      userName,
      userPhone,
      userProfileImage,
      guardianEmail,
      acceptedByUid,
      acceptedByEmail,
    } = after;

    if (!userId || !guardianEmail || !acceptedByUid) {
      console.error('[onGuardianInviteAccepted] Missing required fields for invite:', inviteId);
      await db.collection('guardianInvites').doc(inviteId).set(
        {
          status: 'error',
          errorReason: 'missing-required-fields',
          errorAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return null;
    }

    // Defense-in-depth: ensure acceptedByEmail matches invite recipient email
    if (
      acceptedByEmail &&
      guardianEmail.toLowerCase() !== String(acceptedByEmail).toLowerCase()
    ) {
      console.error('[onGuardianInviteAccepted] Email mismatch for invite:', inviteId);
      await db.collection('guardianInvites').doc(inviteId).set(
        {
          status: 'error',
          errorReason: 'accepted-email-mismatch',
          errorAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return null;
    }

    const guardianRef = db.collection('users').doc(acceptedByUid);
    const guardianSnap = await guardianRef.get();

    if (!guardianSnap.exists) {
      console.error('[onGuardianInviteAccepted] Guardian profile missing:', acceptedByUid);
      await db.collection('guardianInvites').doc(inviteId).set(
        {
          status: 'error',
          errorReason: 'guardian-profile-not-found',
          errorAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return null;
    }

    const guardianData = guardianSnap.data() || {};
    const guardianDocEmail = (guardianData.email || '').toLowerCase();
    const inviteGuardianEmail = guardianEmail.toLowerCase();

    // Validate accepted UID truly belongs to invited email
    if (!guardianDocEmail || guardianDocEmail !== inviteGuardianEmail) {
      console.error('[onGuardianInviteAccepted] Guardian UID/email mismatch detected');
      await db.collection('guardianInvites').doc(inviteId).set(
        {
          status: 'error',
          errorReason: 'guardian-uid-email-mismatch',
          errorAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return null;
    }

    const batch = db.batch();

    // 1) Add guardian under user
    const userGuardianRef = db.collection('users').doc(userId).collection('guardians').doc(acceptedByUid);
    batch.set(
      userGuardianRef,
      {
        name: guardianData.fullName || guardianData.name || 'Guardian',
        phone: guardianData.phone || guardianData.phoneNumber || '',
        email: inviteGuardianEmail,
        profileImage: guardianData.profileImage || null,
        relationship: guardianData.relationship || 'Guardian',
        status: 'active',
        isRegisteredUser: true,
        linkedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // 2) Add user under guardian
    const guardianUserRef = db.collection('users').doc(acceptedByUid).collection('connectedUsers').doc(userId);
    batch.set(
      guardianUserRef,
      {
        name: userName || 'User',
        phone: userPhone || '',
        email: (userEmail || '').toLowerCase(),
        profileImage: userProfileImage || null,
        status: 'active',
        linkedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // 3) Remove invite after successful linking
    batch.delete(db.collection('guardianInvites').doc(inviteId));

    await batch.commit();
    console.log('[onGuardianInviteAccepted] Guardian linked successfully for invite:', inviteId);
    return null;
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// CLOUD FUNCTION: onAlertCreated
// Triggers whenever a new document is created in the `alerts` Firestore collection.
// Reads the alert, finds the user's guardians, fetches their FCM tokens,
// and sends a push notification to each one.
// Also queues escalation metadata for scheduled police escalation processing.
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

    // ── Validate alert data ──────────────────────────────────────────────────
    if (!alertData) {
      console.error('[onAlertCreated] No alert data found, aborting');
      return null;
    }

    const { userId, alertType, latitude, longitude, type } = alertData;
    const triggerType = type === 'AI' ? 'AI' : 'manual';

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
        console.log('[onAlertCreated] User profile loaded for alert notification');
      } else {
        console.warn('[onAlertCreated] User doc not found for alert owner');
      }
    } catch (err) {
      console.error(`[onAlertCreated] Error fetching user profile: ${safeErrorMessage(err)}`);
      // Continue — we can still send notifications with a generic name
    }

    // ── Fetch guardians and profile channels ──────────────────────────────────
    let guardians = [];
    try {
      const guardiansSnap = await db.collection('users').doc(userId).collection('guardians').get();
      guardians = guardiansSnap.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((guardian) => (guardian.status || 'active') === 'active');

      console.log(`[onAlertCreated] Found ${guardians.length} active guardian(s)`);
    } catch (err) {
      console.error(`[onAlertCreated] Error fetching guardians: ${safeErrorMessage(err)}`);
      return null;
    }

    if (guardians.length === 0) {
      console.warn('[onAlertCreated] No guardians found, no notifications to send');
      await enqueueEscalation(alertId, db);
      return null;
    }

    const mapsLink = buildMapsLink(latitude, longitude);
    const guardianTargets = [];

    for (const guardian of guardians) {
      if (!guardian.id) {
        continue;
      }

      let guardianProfile = {};
      try {
        const guardianDoc = await db.collection('users').doc(guardian.id).get();
        if (!guardianDoc.exists) {
          continue;
        }
        guardianProfile = guardianDoc.data() || {};
      } catch (profileError) {
        console.error(
          `[onAlertCreated] Error fetching guardian profile: ${safeErrorMessage(profileError)}`
        );
        continue;
      }

      const prefs = guardianProfile.notificationPreferences || {};
      if (prefs.pushNotifications === false || prefs.guardianAlerts === false) {
        continue;
      }

      const nativeFcmToken = guardianProfile.nativeFcmToken || null;
      const legacyToken = guardianProfile.fcmToken || null;
      const expoPushToken = guardianProfile.expoPushToken || (isExpoToken(legacyToken) ? legacyToken : null);
      const fallbackFcmToken = !isExpoToken(legacyToken) ? legacyToken : null;
      const deliveryId = `${alertId}_${guardian.id}`;

      guardianTargets.push({
        guardianId: guardian.id,
        deliveryId,
        userId,
        alertId,
        userName,
        guardianPhone: guardian.phone || guardianProfile.phone || guardianProfile.phoneNumber || null,
        latitude,
        longitude,
        triggerType,
        mapsLink,
        nativeFcmToken: nativeFcmToken || fallbackFcmToken,
        expoPushToken,
      });
    }

    if (guardianTargets.length === 0) {
      console.warn('[onAlertCreated] No reachable guardian target after preference filtering');
      await enqueueEscalation(alertId, db);
      return null;
    }

    // Persist per-guardian inbox entries for offline replay reliability.
    await Promise.all(
      guardianTargets.map((target) =>
        db.collection('guardianAlertInbox').doc(target.deliveryId).set(
          {
            deliveryId: target.deliveryId,
            alertId,
            userId,
            guardianId: target.guardianId,
            userName,
            triggerType,
            latitude: Number.isFinite(Number(latitude)) ? Number(latitude) : null,
            longitude: Number.isFinite(Number(longitude)) ? Number(longitude) : null,
            mapsLink,
            status: 'pending',
            pushAckAt: null,
            callAcceptedAt: null,
            callDeclinedAt: null,
            smsFallbackSent: false,
            guardianPhone: target.guardianPhone || null,
            lastPushAt: FieldValue.serverTimestamp(),
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
      )
    );

    const fcmTokens = guardianTargets.map((target) => target.nativeFcmToken).filter(Boolean);
    const expoTokens = guardianTargets.map((target) => target.expoPushToken).filter(Boolean);

    // Send call-like emergency payloads to both direct FCM and Expo push channels.
    await Promise.all(
      guardianTargets.map(async (target) => {
        const payload = buildEmergencyDataPayload({
          alertId,
          userId,
          userName,
          latitude,
          longitude,
          triggerType,
          inboxDocId: target.deliveryId,
        });

        const body = buildEmergencyBody(userName, mapsLink);

        const tasks = [];
        if (target.nativeFcmToken) {
          tasks.push(sendHighPriorityFcm([target.nativeFcmToken], payload));
        }
        if (target.expoPushToken) {
          tasks.push(
            sendExpoPushNotifications([target.expoPushToken], SOS_PUSH_TITLE, body, payload)
          );
        }

        if (tasks.length === 0) {
          console.warn('[onAlertCreated] Guardian has no push channel, relying on inbox/SMS fallback');
        }

        await Promise.all(tasks);
      })
    );

    console.log(
      `[onAlertCreated] Push dispatched. directFcm=${fcmTokens.length}, expo=${expoTokens.length}, guardians=${guardianTargets.length}`
    );

    // Fire fail-safe SMS fallback for guardians that still have no push ack in 5-10 seconds.
    await executeSmsFallbackForPendingDeliveries(alertId, guardianTargets);

    await enqueueEscalation(alertId, db);

    return {
      guardiansNotified: guardianTargets.length,
      directFcm: fcmTokens.length,
      expo: expoTokens.length,
    };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// CLOUD FUNCTION: onAlertCancelled
// Triggers when an alert status transitions to "cancelled" and notifies guardians.
// ─────────────────────────────────────────────────────────────────────────────
exports.onAlertCancelled = onDocumentUpdated(
  {
    document: 'alerts/{alertId}',
    region: 'us-central1',
  },
  async (event) => {
    const alertId = event.params.alertId;
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();

    if (!before || !after) return null;

    // Only react when alert transitions into cancelled
    if (before.status === after.status || after.status !== 'cancelled') {
      return null;
    }

    const userId = after.userId || after.ownerId;
    if (!userId) {
      console.warn(`[onAlertCancelled] Missing owner on alert ${alertId}, skipping`);
      return null;
    }

    // Fetch user name for notification copy
    let userName = 'The user';
    try {
      const userDoc = await db.collection('users').doc(userId).get();
      if (userDoc.exists) {
        const userData = userDoc.data() || {};
        userName = userData.fullName || userData.email || 'The user';
      }
    } catch (err) {
      console.error(`[onAlertCancelled] Failed to fetch user profile: ${safeErrorMessage(err)}`);
    }

    // Fetch active guardians
    let guardians = [];
    try {
      const guardiansSnap = await db
        .collection('users')
        .doc(userId)
        .collection('guardians')
        .get();

      guardians = guardiansSnap.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((guardian) => (guardian.status || 'active') === 'active');
    } catch (err) {
      console.error(`[onAlertCancelled] Error fetching guardians: ${safeErrorMessage(err)}`);
      return null;
    }

    if (guardians.length === 0) {
      console.log(`[onAlertCancelled] No guardians to notify for alert ${alertId}`);
      return null;
    }

    // Fetch guardian Expo tokens
    const tokenResults = await Promise.all(
      guardians.map(async (guardian) => {
        if (!guardian.id || guardian.isRegisteredUser === false) {
          return null;
        }

        try {
          const guardianDoc = await db.collection('users').doc(guardian.id).get();
          if (!guardianDoc.exists) return null;

          const guardianProfile = guardianDoc.data() || {};
          const prefs = guardianProfile.notificationPreferences || {};
          if (prefs.pushNotifications === false || prefs.guardianAlerts === false) {
            return null;
          }

          return guardianProfile.fcmToken || null;
        } catch (err) {
          console.error(`[onAlertCancelled] Token fetch failed for guardian: ${safeErrorMessage(err)}`);
          return null;
        }
      })
    );

    const validTokens = tokenResults.filter(Boolean);
    if (validTokens.length === 0) {
      console.log(`[onAlertCancelled] No guardian tokens for alert ${alertId}`);
      return null;
    }

    try {
      return await sendExpoPushNotifications(
        validTokens,
        'Emergency Cancelled',
        `${userName} has cancelled the emergency alert.`,
        {
          screen: 'GuardianDashboard',
          userId,
          alertId,
          alertType: 'SOS_CANCELLED',
        }
      );
    } catch (err) {
      console.error(`[onAlertCancelled] Notification send failed: ${safeErrorMessage(err)}`);
      return null;
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// CLOUD FUNCTION: onGuardianTokenUpdated
// Replays pending guardian inbox alerts whenever guardian push token changes.
// This helps notify guardians when they come back online or reinstall the app.
// ─────────────────────────────────────────────────────────────────────────────
exports.onGuardianTokenUpdated = onDocumentUpdated(
  {
    document: 'users/{guardianId}',
    region: 'us-central1',
  },
  async (event) => {
    const guardianId = event.params.guardianId;
    const before = event.data?.before?.data() || {};
    const after = event.data?.after?.data() || {};

    const beforeNative = before.nativeFcmToken || null;
    const afterNative = after.nativeFcmToken || null;
    const beforeExpo = before.expoPushToken || before.fcmToken || null;
    const afterExpo = after.expoPushToken || after.fcmToken || null;

    const tokenChanged = beforeNative !== afterNative || beforeExpo !== afterExpo;
    if (!tokenChanged) {
      return null;
    }

    let pendingSnap;
    try {
      pendingSnap = await db
        .collection('guardianAlertInbox')
        .where('guardianId', '==', guardianId)
        .where('status', '==', 'pending')
        .limit(20)
        .get();
    } catch (error) {
      console.error(`[onGuardianTokenUpdated] Query failed: ${safeErrorMessage(error)}`);
      return null;
    }

    if (pendingSnap.empty) {
      return null;
    }

    const sendTasks = [];
    const now = FieldValue.serverTimestamp();

    for (const docSnap of pendingSnap.docs) {
      const data = docSnap.data() || {};
      const payload = buildEmergencyDataPayload({
        alertId: data.alertId,
        userId: data.userId,
        userName: data.userName,
        latitude: data.latitude,
        longitude: data.longitude,
        triggerType: data.triggerType,
        inboxDocId: docSnap.id,
      });

      const body = buildEmergencyBody(data.userName, data.mapsLink);

      if (afterNative) {
        sendTasks.push(sendHighPriorityFcm([afterNative], payload));
      }

      if (afterExpo && isExpoToken(afterExpo)) {
        sendTasks.push(sendExpoPushNotifications([afterExpo], SOS_PUSH_TITLE, body, payload));
      }

      sendTasks.push(
        db.collection('guardianAlertInbox').doc(docSnap.id).set(
          {
            lastPushAt: now,
            updatedAt: now,
          },
          { merge: true }
        )
      );
    }

    await Promise.all(sendTasks);
    console.log(`[onGuardianTokenUpdated] Replayed ${pendingSnap.size} pending inbox alert(s)`);

    return null;
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// CLOUD FUNCTION: processEscalations
// Runs every minute and escalates due SOS alerts (active + escalationDueAt <= now)
// ─────────────────────────────────────────────────────────────────────────────
exports.processEscalations = onSchedule(
  {
    schedule: 'every 1 minutes',
    region: 'us-central1',
    timeZone: 'Etc/UTC',
  },
  async () => {
    try {
      const summary = await processDueEscalations(db, sendExpoPushNotifications);
      console.log('[processEscalations] Completed run:', summary);
    } catch (error) {
      console.error(`[processEscalations] Run failed: ${safeErrorMessage(error)}`);
    }
    return null;
  }
);
