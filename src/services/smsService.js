import * as SMS from 'expo-sms';
import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import logger from '../utils/logger';
import { fetchGuardians } from './profile';
import { isOnline } from './networkService';

// ─────────────────────────────────────────────────────────────────────────────
// Native silent-SMS helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send SMS without any user-facing UI.
 *
 * Android: delegates to the custom SmsModule native bridge which calls
 *          android.telephony.SmsManager directly — zero user interaction.
 * iOS:     falls back to expo-sms composer (iOS never permits silent SMS).
 *
 * @param {string[]} phoneNumbers - Array of cleaned phone number strings
 * @param {string}   message      - SMS body
 * @returns {Promise<{ sent: number, failed: number, errors: string }>}
 */
async function sendSilentSMS(phoneNumbers, message) {
  // ── Android: use native SmsManager ───────────────────────────────────────
  if (Platform.OS === 'android') {
    const { SmsModule } = NativeModules;

    if (!SmsModule) {
      // Native module not linked (e.g. Expo Go). Surface the error so the
      // caller can decide whether to fall back to the composer.
      throw new Error(
        'SmsModule native module is not available. Rebuild the app with `npx expo run:android`.'
      );
    }

    // SmsModule.sendSMS resolves with { sent, failed, errors }
    const result = await SmsModule.sendSMS(phoneNumbers, message);
    return result;
  }

  // ── iOS / other: open SMS composer (still requires a user tap) ────────────
  const composerResult = await SMS.sendSMSAsync(phoneNumbers, message);

  const composerSent =
    composerResult.result === 'sent' || composerResult.result === 'unknown'
      ? phoneNumbers.length
      : 0;

  return {
    sent: composerSent,
    failed: phoneNumbers.length - composerSent,
    errors: composerResult.result === 'cancelled' ? 'SMS composer was cancelled by the user' : '',
  };
}

const TAG = '[smsService]';

// ─────────────────────────────────────────────────────────────────────────────
// SMS Message Template
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate the emergency SMS message with location details
 * @param {Object} location - Location object with latitude and longitude
 * @param {string} userName - User's display name (optional)
 * @returns {string} Formatted SMS message
 */
export function generateEmergencyMessage(location, userName = 'A ShieldHer user') {
  const { latitude, longitude } = location;
  const mapsLink = `https://maps.google.com/?q=${latitude},${longitude}`;
  const timestamp = new Date().toLocaleString();

  return (
    `EMERGENCY ALERT - SHIELDHER\n\n` +
    `${userName} has triggered an SOS alert and needs immediate help!\n\n` +
    `Last Known Location:\n` +
    `Lat: ${latitude.toFixed(6)}\n` +
    `Lng: ${longitude.toFixed(6)}\n\n` +
    `Google Maps: ${mapsLink}\n\n` +
    `Time: ${timestamp}\n\n` +
    `This is an automated emergency alert. Please respond immediately.`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SMS Permission Handling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if SMS sending is available on this device
 * @returns {Promise<boolean>} True if SMS is available
 */
export async function isSMSAvailable() {
  try {
    const isAvailable = await SMS.isAvailableAsync();
    logger.debug(TAG, 'SMS availability check:', isAvailable);
    return isAvailable;
  } catch (error) {
    logger.error(TAG, 'Failed to check SMS availability:', error);
    return false;
  }
}

/**
 * Request SMS permission on Android
 * Required for direct SMS sending without opening SMS app
 * @returns {Promise<boolean>} True if permission granted
 */
export async function requestSMSPermission() {
  if (Platform.OS !== 'android') {
    // iOS handles SMS differently - no explicit permission needed for compose
    return true;
  }

  try {
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.SEND_SMS, {
      title: 'ShieldHer Emergency SMS Permission',
      message:
        'ShieldHer needs permission to send emergency SMS alerts ' +
        'to your guardians when you are offline.',
      buttonNeutral: 'Ask Me Later',
      buttonNegative: 'Deny',
      buttonPositive: 'Allow',
    });

    const isGranted = granted === PermissionsAndroid.RESULTS.GRANTED;
    logger.info(TAG, 'SMS permission request result:', isGranted ? 'granted' : 'denied');
    return isGranted;
  } catch (error) {
    logger.error(TAG, 'Failed to request SMS permission:', error);
    return false;
  }
}

/**
 * Check if SMS permission is already granted (Android)
 * @returns {Promise<boolean>} True if permission granted
 */
export async function hasSMSPermission() {
  if (Platform.OS !== 'android') {
    return true;
  }

  try {
    const result = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.SEND_SMS);
    return result;
  } catch (error) {
    logger.error(TAG, 'Failed to check SMS permission:', error);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core SMS Sending Logic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send SMS to a single recipient
 * @param {string} phoneNumber - Recipient phone number
 * @param {string} message - Message content
 * @returns {Promise<Object>} Result object with success status and details
 */
async function sendSingleSMS(phoneNumber, message) {
  try {
    // Validate phone number
    if (!phoneNumber || phoneNumber.trim().length < 10) {
      return {
        success: false,
        phoneNumber,
        error: 'Invalid phone number',
      };
    }

    // Clean phone number (remove spaces, dashes, etc.)
    const cleanedNumber = phoneNumber.replace(/[\s\-()]/g, '');

    const result = await SMS.sendSMSAsync([cleanedNumber], message);

    logger.debug(TAG, `SMS to ${cleanedNumber.slice(-4)}: result=${result.result}`);

    return {
      success: result.result === 'sent' || result.result === 'unknown',
      phoneNumber: cleanedNumber,
      result: result.result,
    };
  } catch (error) {
    logger.error(TAG, `Failed to send SMS to ${phoneNumber}:`, error);
    return {
      success: false,
      phoneNumber,
      error: error.message,
    };
  }
}

/**
 * Send emergency SMS to all guardians with valid phone numbers
 * @param {string} userId - Firebase user ID
 * @param {Object} location - Location object {latitude, longitude}
 * @param {string} userName - User's display name for the message
 * @returns {Promise<Object>} Result summary with sent/failed counts
 */
export async function sendEmergencySMSToGuardians(userId, location, userName = null) {
  const summary = {
    totalGuardians: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    results: [],
  };

  try {
    // Check SMS availability first
    const smsAvailable = await isSMSAvailable();
    if (!smsAvailable) {
      logger.error(TAG, 'SMS is not available on this device');
      summary.errors.push('SMS not available on this device');
      return summary;
    }

    // Check/request permission on Android
    if (Platform.OS === 'android') {
      const hasPermission = await hasSMSPermission();
      if (!hasPermission) {
        const granted = await requestSMSPermission();
        if (!granted) {
          logger.error(TAG, 'SMS permission denied by user');
          summary.errors.push('SMS permission denied');
          return summary;
        }
      }
    }

    // Fetch guardians from Firestore
    // Note: This may fail if truly offline, so we should cache guardians
    let guardians = [];
    try {
      guardians = await fetchGuardians(userId);
    } catch (fetchError) {
      logger.error(TAG, 'Failed to fetch guardians:', fetchError);
      summary.errors.push('Could not fetch guardian list');
      return summary;
    }

    summary.totalGuardians = guardians.length;

    if (guardians.length === 0) {
      logger.warn(TAG, 'No guardians found for user');
      summary.errors.push('No guardians registered');
      return summary;
    }

    // Filter guardians with valid phone numbers
    const guardiansWithPhones = guardians.filter((g) => g.phone && g.phone.trim().length >= 10);

    if (guardiansWithPhones.length === 0) {
      logger.warn(TAG, 'No guardians have valid phone numbers');
      summary.errors.push('No guardians have valid phone numbers');
      summary.skipped = guardians.length;
      return summary;
    }

    summary.skipped = guardians.length - guardiansWithPhones.length;

    // Generate emergency message
    const message = generateEmergencyMessage(location, userName);

    // Collect all phone numbers for batch sending
    const phoneNumbers = guardiansWithPhones.map((g) => g.phone.replace(/[\s\-()]/g, ''));

    logger.info(TAG, `Sending autonomous emergency SMS to ${phoneNumbers.length} guardian(s)`);

    try {
      // sendSilentSMS: uses SmsManager on Android (no UI), composer on iOS
      const result = await sendSilentSMS(phoneNumbers, message);

      summary.sent = result.sent ?? 0;
      summary.failed = result.failed ?? 0;

      if (result.errors) {
        summary.errors.push(result.errors);
      }

      if (summary.sent > 0) {
        logger.info(
          TAG,
          `Emergency SMS sent to ${summary.sent} of ${phoneNumbers.length} guardian(s)`
        );
      } else {
        logger.warn(TAG, 'No SMS messages were delivered in this batch');
      }

      summary.results.push({
        recipients: phoneNumbers.length,
        sent: summary.sent,
        failed: summary.failed,
      });
    } catch (batchError) {
      logger.error(TAG, 'Batch SMS failed, attempting individual sends:', batchError);

      // Fallback: try sending individually (each is its own SmsManager call)
      for (const guardian of guardiansWithPhones) {
        const result = await sendSingleSMS(guardian.phone, message);
        summary.results.push(result);

        if (result.success) {
          summary.sent++;
        } else {
          summary.failed++;
          summary.errors.push(`Failed to send to ${guardian.name}: ${result.error}`);
        }
      }
    }

    logger.info(TAG, `SMS fallback complete: ${summary.sent} sent, ${summary.failed} failed`);
    return summary;
  } catch (error) {
    logger.error(TAG, 'sendEmergencySMSToGuardians fatal error:', error);
    summary.errors.push(error.message);
    return summary;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Offline-Aware SOS Dispatch
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute SMS fallback for SOS alert when device is offline
 * This is the main entry point called from the SOS trigger flow
 *
 * @param {string} userId - Firebase user ID
 * @param {Object} location - Location object {latitude, longitude, accuracy}
 * @param {string} userName - User's display name
 * @param {boolean} forceOffline - Force SMS even if online (for testing)
 * @returns {Promise<Object>} Result indicating whether SMS was sent
 */
export async function executeOfflineSMSFallback(
  userId,
  location,
  userName = null,
  forceOffline = false
) {
  const result = {
    triggered: false,
    reason: null,
    smsResult: null,
  };

  try {
    // Check connectivity unless forced offline
    if (!forceOffline) {
      const online = await isOnline();
      if (online) {
        result.reason = 'Device is online - FCM will handle notification';
        logger.debug(TAG, result.reason);
        return result;
      }
    }

    logger.info(TAG, 'Device offline - initiating SMS fallback');
    result.triggered = true;

    // Validate required data
    if (!userId) {
      result.reason = 'Missing user ID';
      logger.error(TAG, result.reason);
      return result;
    }

    if (!location || !location.latitude || !location.longitude) {
      result.reason = 'Missing location data';
      logger.error(TAG, result.reason);
      return result;
    }

    // Execute SMS sending
    const smsResult = await sendEmergencySMSToGuardians(userId, location, userName);
    result.smsResult = smsResult;

    if (smsResult.sent > 0) {
      result.reason = `SMS sent to ${smsResult.sent} guardian(s)`;
      logger.info(TAG, result.reason);
    } else if (smsResult.errors.length > 0) {
      result.reason = smsResult.errors.join('; ');
      logger.warn(TAG, 'SMS fallback completed with errors:', result.reason);
    } else {
      result.reason = 'No guardians to notify via SMS';
      logger.warn(TAG, result.reason);
    }

    return result;
  } catch (error) {
    logger.error(TAG, 'executeOfflineSMSFallback error:', error);
    result.reason = error.message;
    return result;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Guardian Cache for True Offline Scenarios
// ─────────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';

const GUARDIAN_CACHE_KEY = '@shieldher_guardian_cache';

/**
 * Cache guardians locally for offline SMS fallback
 * Call this when guardians are fetched/updated while online
 * @param {string} userId - Firebase user ID
 * @param {Array} guardians - Array of guardian objects
 */
export async function cacheGuardiansForOffline(userId, guardians) {
  try {
    const cacheData = {
      userId,
      guardians,
      cachedAt: Date.now(),
    };
    await AsyncStorage.setItem(GUARDIAN_CACHE_KEY, JSON.stringify(cacheData));
    logger.debug(TAG, `Cached ${guardians.length} guardians for offline use`);
  } catch (error) {
    logger.error(TAG, 'Failed to cache guardians:', error);
  }
}

/**
 * Retrieve cached guardians for offline use
 * @param {string} userId - Firebase user ID
 * @returns {Promise<Array|null>} Cached guardians or null
 */
export async function getCachedGuardians(userId) {
  try {
    const cached = await AsyncStorage.getItem(GUARDIAN_CACHE_KEY);
    if (!cached) return null;

    const cacheData = JSON.parse(cached);

    // Verify cache belongs to current user
    if (cacheData.userId !== userId) {
      logger.warn(TAG, 'Cached guardians belong to different user');
      return null;
    }

    // Cache is valid for 24 hours
    const cacheAge = Date.now() - cacheData.cachedAt;
    const maxCacheAge = 24 * 60 * 60 * 1000; // 24 hours

    if (cacheAge > maxCacheAge) {
      logger.warn(TAG, 'Guardian cache is stale (>24h)');
      // Still return stale data for emergency - better than nothing
    }

    logger.debug(TAG, `Retrieved ${cacheData.guardians.length} cached guardians`);
    return cacheData.guardians;
  } catch (error) {
    logger.error(TAG, 'Failed to retrieve cached guardians:', error);
    return null;
  }
}

/**
 * Clear guardian cache (call on logout)
 */
export async function clearGuardianCache() {
  try {
    await AsyncStorage.removeItem(GUARDIAN_CACHE_KEY);
    logger.debug(TAG, 'Guardian cache cleared');
  } catch (error) {
    logger.error(TAG, 'Failed to clear guardian cache:', error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Enhanced Offline SMS with Cache Fallback
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send emergency SMS using cached guardians when Firestore is unreachable
 * This is the ultimate fallback for truly offline scenarios
 *
 * @param {string} userId - Firebase user ID
 * @param {Object} location - Location object {latitude, longitude}
 * @param {string} userName - User's display name
 * @returns {Promise<Object>} Result with sent/failed counts
 */
export async function sendOfflineEmergencySMS(userId, location, userName = null) {
  const summary = {
    totalGuardians: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    usedCache: false,
  };

  try {
    // Try to get guardians from cache first (faster for offline)
    let guardians = await getCachedGuardians(userId);

    if (guardians && guardians.length > 0) {
      summary.usedCache = true;
      logger.info(TAG, 'Using cached guardians for offline SMS');
    } else {
      // Last resort: try Firestore (may fail if truly offline)
      try {
        guardians = await fetchGuardians(userId);
      } catch {
        logger.warn(TAG, 'Could not fetch guardians from Firestore');
        summary.errors.push('No cached guardians and Firestore unreachable');
        return summary;
      }
    }

    summary.totalGuardians = guardians.length;

    if (guardians.length === 0) {
      summary.errors.push('No guardians available');
      return summary;
    }

    // Filter and prepare phone numbers
    const validGuardians = guardians.filter((g) => g.phone && g.phone.trim().length >= 10);
    summary.skipped = guardians.length - validGuardians.length;

    if (validGuardians.length === 0) {
      summary.errors.push('No guardians have valid phone numbers');
      return summary;
    }

    // Generate message and send
    const message = generateEmergencyMessage(location, userName);
    const phoneNumbers = validGuardians.map((g) => g.phone.replace(/[\s\-()]/g, ''));

    const smsAvailable = await isSMSAvailable();
    if (!smsAvailable) {
      summary.errors.push('SMS not available');
      return summary;
    }

    logger.info(TAG, `Sending autonomous offline SMS to ${phoneNumbers.length} guardian(s)`);

    // sendSilentSMS: uses SmsManager on Android (no UI), composer on iOS
    const result = await sendSilentSMS(phoneNumbers, message);

    summary.sent = result.sent ?? 0;
    summary.failed = result.failed ?? 0;

    if (result.errors) {
      summary.errors.push(result.errors);
    }

    return summary;
  } catch (error) {
    logger.error(TAG, 'sendOfflineEmergencySMS error:', error);
    summary.errors.push(error.message);
    return summary;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Error Message Helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get user-friendly error message for SMS failures
 * @param {Object} smsResult - Result from SMS sending functions
 * @returns {string} User-friendly error message
 */
export function getSMSErrorMessage(smsResult) {
  if (!smsResult) {
    return 'SMS service unavailable';
  }

  if (smsResult.sent > 0) {
    return null; // No error
  }

  if (smsResult.errors && smsResult.errors.length > 0) {
    const error = smsResult.errors[0];

    if (error.includes('permission')) {
      return 'SMS permission denied. Please enable in Settings.';
    }
    if (error.includes('No guardians')) {
      return 'No guardians registered. Add guardians in Settings.';
    }
    if (error.includes('phone number')) {
      return 'No guardians have valid phone numbers.';
    }
    if (error.includes('cancelled')) {
      return 'SMS sending was cancelled.';
    }

    return error;
  }

  return 'Failed to send emergency SMS. Please try calling for help.';
}
