/**
 * OTP Authentication Service for ShieldHer
 *
 * Implements phone-number-based OTP authentication using Firebase Cloud Functions.
 * Flow: sendOTP → verifyOTP → signInWithCustomToken → user profile stored in Firestore
 *
 * This service communicates with two Cloud Functions:
 * - sendOTP: generates and sends a 6-digit OTP via SMS
 * - verifyOTP: validates OTP and returns a Firebase custom token
 */

import { signInWithCustomToken } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import Constants from 'expo-constants';
import logger from '../utils/logger';

const TAG = '[authService]';

// Cloud Functions base URL (uses Firebase project ID from config)
const expoConfig = Constants.expoConfig?.extra || Constants.manifest?.extra || {};
const PROJECT_ID = expoConfig.firebaseProjectId;
const FUNCTIONS_BASE_URL = `https://us-central1-${PROJECT_ID}.cloudfunctions.net`;

/**
 * Send OTP to a phone number via Cloud Function
 * @param {string} phoneNumber - Phone number with country code (e.g., +923001234567)
 * @returns {Promise<Object>} { success: boolean, message: string, expiresIn: number }
 */
export async function sendOTP(phoneNumber) {
  logger.info(TAG, 'sendOTP start', { phoneNumber: phoneNumber.slice(0, 5) + '***' });

  if (!phoneNumber || phoneNumber.length < 10) {
    throw createAuthError('validation/invalid-phone', 'Please enter a valid phone number');
  }

  // Normalize phone number – ensure it starts with +
  const normalizedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

  try {
    const response = await fetch(`${FUNCTIONS_BASE_URL}/sendOTP`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: normalizedPhone }),
    });

    const data = await response.json();

    if (!response.ok) {
      logger.error(TAG, 'sendOTP failed:', data);
      throw createAuthError(
        data.code || 'otp/send-failed',
        data.message || 'Failed to send OTP. Please try again.'
      );
    }

    logger.info(TAG, 'OTP sent successfully');
    return {
      success: true,
      message: data.message || 'OTP sent successfully',
      expiresIn: data.expiresIn || 300, // 5 minutes default
    };
  } catch (error) {
    if (error.code) throw error; // Re-throw our custom errors
    logger.error(TAG, 'sendOTP network error:', error);
    throw createAuthError(
      'otp/network-error',
      'Network error. Please check your connection and try again.'
    );
  }
}

/**
 * Verify OTP and sign in with the returned custom token
 * @param {string} phoneNumber - Phone number with country code
 * @param {string} otpCode - 6-digit OTP code entered by user
 * @returns {Promise<Object>} { user, profile, isNewUser }
 */
export async function verifyOTP(phoneNumber, otpCode) {
  logger.info(TAG, 'verifyOTP start', { phoneNumber: phoneNumber.slice(0, 5) + '***' });

  if (!otpCode || otpCode.length !== 6) {
    throw createAuthError('validation/invalid-otp', 'Please enter a valid 6-digit code');
  }

  const normalizedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

  try {
    // Step 1: Verify OTP via Cloud Function – returns a Firebase custom token
    const response = await fetch(`${FUNCTIONS_BASE_URL}/verifyOTP`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phoneNumber: normalizedPhone,
        code: otpCode,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      logger.error(TAG, 'verifyOTP failed:', data);
      throw createAuthError(
        data.code || 'otp/verify-failed',
        data.message || 'Invalid or expired OTP. Please try again.'
      );
    }

    const { customToken, isNewUser: _isNewUser } = data;

    if (!customToken) {
      throw createAuthError('otp/no-token', 'Server error. No authentication token received.');
    }

    // Step 2: Sign in with the custom token
    logger.info(TAG, 'Signing in with custom token...');
    const userCredential = await signInWithCustomToken(auth, customToken);
    const user = userCredential.user;
    logger.info(TAG, 'Signed in successfully', { uid: user.uid });

    // Step 3: Create or update user profile in Firestore
    const userDocRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userDocRef);

    if (!userSnap.exists()) {
      // New user – create profile
      const userProfile = {
        phoneNumber: normalizedPhone,
        role: 'user',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        authMethod: 'phone',
      };

      await setDoc(userDocRef, userProfile);
      logger.info(TAG, 'New user profile created in Firestore');

      return { user, profile: userProfile, isNewUser: true };
    } else {
      // Existing user – update last login
      await setDoc(
        userDocRef,
        { updatedAt: serverTimestamp(), phoneNumber: normalizedPhone },
        { merge: true }
      );
      logger.info(TAG, 'Existing user profile updated');

      return { user, profile: userSnap.data(), isNewUser: false };
    }
  } catch (error) {
    if (error.code) throw error; // Re-throw our custom errors
    logger.error(TAG, 'verifyOTP error:', error);
    throw createAuthError(
      'otp/verify-error',
      error.message || 'Verification failed. Please try again.'
    );
  }
}

/**
 * Resend OTP to the same phone number
 * Wrapper around sendOTP with specific messaging
 * @param {string} phoneNumber - Phone number with country code
 * @returns {Promise<Object>} Same as sendOTP
 */
export async function resendOTP(phoneNumber) {
  logger.info(TAG, 'resendOTP');
  return sendOTP(phoneNumber);
}

// ─────────────────────────────────────────────────────────────────────────────
// Error Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a structured auth error
 * @param {string} code - Error code
 * @param {string} message - User-friendly message
 * @returns {Error}
 */
function createAuthError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * Map OTP auth error codes to user-friendly messages
 * @param {Error} error - Error object
 * @returns {string} User-friendly error message
 */
export function getOTPErrorMessage(error) {
  const errorCodeMap = {
    'validation/invalid-phone': 'Please enter a valid phone number with country code.',
    'validation/invalid-otp': 'Please enter a valid 6-digit OTP code.',
    'otp/send-failed': 'Failed to send OTP. Please try again.',
    'otp/rate-limited': 'Too many OTP requests. Please wait before trying again.',
    'otp/verify-failed': 'Invalid or expired OTP code.',
    'otp/expired': 'OTP has expired. Please request a new code.',
    'otp/no-token': 'Server error. Please try again.',
    'otp/network-error': 'Network error. Check your internet connection.',
    'otp/verify-error': 'Verification failed. Please try again.',
    'auth/invalid-custom-token': 'Authentication error. Please try again.',
    'auth/custom-token-mismatch': 'Authentication error. Please contact support.',
  };

  const code = error?.code || '';
  return errorCodeMap[code] || error?.message || 'An error occurred. Please try again.';
}
