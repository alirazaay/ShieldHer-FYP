import { auth, db } from '../config/firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { clearGuardianCache } from './smsService';
import logger from '../utils/logger';

/**
 * Register a new user with Firebase Auth and Firestore
 * @param {Object} params - Registration parameters
 * @param {string} params.email - User email address
 * @param {string} params.password - User password (min 6 chars)
 * @param {string} params.role - 'user' or 'guardian'
 * @param {Object} params.profile - Additional user profile data
 * @param {string} params.profile.fullName - Full name (required)
 * @param {string} params.profile.phone - Phone number (required)
 * @param {string} params.profile.emergencyPhone - Emergency phone (required for users)
 * @param {string} params.profile.emergencyEmail - Emergency email (required for users)
 * @param {string} params.profile.relationship - Relationship to user (required for guardians)
 * @returns {Promise<Object>} User credential with user object
 * @throws {Error} Firebase error with code and message
 */
export async function registerUser({ email, password, role, profile = {} }) {
  logger.info('[auth]', 'registerUser start', { email, role, profile });

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    const error = new Error('Invalid email address');
    error.code = 'auth/invalid-email';
    throw error;
  }

  // Validate password strength
  if (!password || password.length < 6) {
    const error = new Error('Password must be at least 6 characters');
    error.code = 'auth/weak-password';
    throw error;
  }

  // Validate required profile fields
  if (!profile.fullName || !profile.fullName.trim()) {
    const error = new Error('Full name is required');
    error.code = 'validation/missing-fullName';
    throw error;
  }

  if (!profile.phone || !profile.phone.trim()) {
    const error = new Error('Phone number is required');
    error.code = 'validation/missing-phone';
    throw error;
  }

  // Validate role-specific fields
  if (role === 'user') {
    if (!profile.emergencyPhone || !profile.emergencyPhone.trim()) {
      const error = new Error('Emergency contact phone is required for users');
      error.code = 'validation/missing-emergencyPhone';
      throw error;
    }

    if (!profile.emergencyEmail || !profile.emergencyEmail.trim()) {
      const error = new Error('Emergency contact email is required for users');
      error.code = 'validation/missing-emergencyEmail';
      throw error;
    }

    // Validate emergency email format
    if (!emailRegex.test(profile.emergencyEmail)) {
      const error = new Error('Invalid emergency contact email');
      error.code = 'validation/invalid-emergencyEmail';
      throw error;
    }
  } else if (role === 'guardian') {
    if (!profile.relationship || !profile.relationship.trim()) {
      const error = new Error('Relationship to user is required for guardians');
      error.code = 'validation/missing-relationship';
      throw error;
    }
  }

  try {
    // Create user in Firebase Auth
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    const uid = cred.user.uid;
    logger.info('[auth]', 'created user', uid);

    // Prepare user profile data
    const userProfile = {
      fullName: profile.fullName.trim(),
      phone: profile.phone.trim(),
      phoneNumber: profile.phone.trim(),
      email: email.trim(),
      role,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    // Add role-specific fields
    if (role === 'user') {
      userProfile.emergencyPhone = profile.emergencyPhone.trim();
      userProfile.emergencyEmail = profile.emergencyEmail.trim();
    } else if (role === 'guardian') {
      userProfile.relationship = profile.relationship.trim();
    }

    // Save user profile to Firestore
    await setDoc(doc(db, 'users', uid), userProfile);
    logger.info('[auth]', 'user profile written to Firestore');

    return cred;
  } catch (error) {
    logger.error('[auth]', 'registerUser error:', error);
    throw error;
  }
}

/**
 * Map Firebase error codes to user-friendly messages
 * @param {Error} error - Firebase error object
 * @returns {string} User-friendly error message
 */
export function getAuthErrorMessage(error) {
  const errorCodeMap = {
    'auth/email-already-in-use': 'Email already in use. Try logging in.',
    'auth/weak-password': 'Password is too weak. Use at least 6 characters.',
    'auth/invalid-email': 'Invalid email address.',
    'auth/user-not-found': 'No account found with that email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/requires-recent-login': 'Please log in again before retrying.',
    'validation/missing-fullName': 'Full name is required.',
    'validation/missing-phone': 'Phone number is required.',
    'validation/missing-emergencyPhone': 'Emergency contact phone is required for users.',
    'validation/missing-emergencyEmail': 'Emergency contact email is required for users.',
    'validation/invalid-emergencyEmail': 'Invalid emergency contact email.',
    'validation/missing-relationship': 'Relationship to user is required for guardians.',
  };

  const code = error.code || error.message;
  return errorCodeMap[code] || error.message || 'An error occurred. Please try again.';
}

export async function loginUser({ email, password }) {
  logger.info('[auth]', 'loginUser start', { email });
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;
  logger.info('[auth]', 'signed in', uid);
  const snap = await getDoc(doc(db, 'users', uid));
  const data = snap.exists() ? snap.data() : null;
  logger.info('[auth]', 'fetched profile', { hasProfile: !!data, role: data?.role });
  return { user: cred.user, profile: data };
}

export async function resetPassword(email) {
  logger.info('[auth]', 'resetPassword start', { email });
  await sendPasswordResetEmail(auth, email);
  logger.info('[auth]', 'resetPassword email sent');
  return true;
}

export async function getCurrentUserRole() {
  logger.info('[auth]', 'getCurrentUserRole start');
  const user = auth.currentUser;
  if (!user) return null;
  const snap = await getDoc(doc(db, 'users', user.uid));
  return snap.exists() ? snap.data().role : null;
}

export async function signOutUser() {
  logger.info('[auth]', 'signOutUser start');
  // Ensure offline guardian cache does not leak across accounts on shared devices.
  try {
    await clearGuardianCache();
  } catch (err) {
    logger.warn('[auth]', 'Failed to clear guardian cache during sign out:', err?.message || err);
  }
  await signOut(auth);
  logger.info('[auth]', 'signOutUser complete');
}
