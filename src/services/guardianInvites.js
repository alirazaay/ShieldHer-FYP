import {
  doc,
  collection,
  query,
  where,
  getDocs,
  setDoc,
  deleteDoc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../config/firebase';

/**
 * Send a guardian invite from a user to a guardian
 * @param {Object} params - Invite parameters
 * @param {string} params.userId - Firebase user ID (sender)
 * @param {string} params.userEmail - User email
 * @param {string} params.userName - User full name
 * @param {string} params.userPhone - User phone number
 * @param {string} params.guardianEmail - Guardian email address (recipient)
 * @param {string} params.userProfileImage - Optional user profile image URL
 * @param {string} params.message - Optional message/reason for invite
 * @returns {Promise<string>} Invite document ID
 * @throws {Error} Firebase or validation error
 */
export async function sendGuardianInvite({
  userId,
  userEmail,
  userName,
  userPhone,
  guardianEmail,
  userProfileImage = null,
  message = '',
}) {
  console.log('[guardianInvites] sendGuardianInvite start', {
    userId,
    userEmail,
    guardianEmail,
  });

  // Validate required fields
  if (!userId || !userEmail || !userName || !userPhone || !guardianEmail) {
    const error = new Error('Missing required fields for guardian invite');
    error.code = 'validation/missing-fields';
    throw error;
  }

  // Validate email formats
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(userEmail)) {
    const error = new Error('Invalid user email address');
    error.code = 'validation/invalid-userEmail';
    throw error;
  }
  if (!emailRegex.test(guardianEmail)) {
    const error = new Error('Invalid guardian email address');
    error.code = 'validation/invalid-guardianEmail';
    throw error;
  }

  try {
    // Check for duplicate pending invites from same user to same guardian
    const invitesRef = collection(db, 'guardianInvites');
    const duplicateQuery = query(
      invitesRef,
      where('userId', '==', userId),
      where('guardianEmail', '==', guardianEmail.toLowerCase()),
      where('status', '==', 'pending')
    );
    const duplicateSnap = await getDocs(duplicateQuery);

    if (!duplicateSnap.empty) {
      const error = new Error('Invite already sent to this guardian');
      error.code = 'validation/duplicate-invite';
      throw error;
    }

    // Create new invite document
    const newInviteRef = doc(invitesRef);
    const inviteData = {
      userId,
      userEmail: userEmail.toLowerCase(),
      userName: userName.trim(),
      userPhone: userPhone.trim(),
      userProfileImage: userProfileImage || null,
      guardianEmail: guardianEmail.toLowerCase(),
      message: message.trim(),
      status: 'pending',
      createdAt: serverTimestamp(),
    };

    await setDoc(newInviteRef, inviteData);

    console.log('[guardianInvites] Guardian invite sent successfully:', newInviteRef.id);
    return newInviteRef.id;
  } catch (error) {
    console.error('[guardianInvites] sendGuardianInvite error:', error);
    throw error;
  }
}

/**
 * Fetch all pending invites for a guardian by email
 * @param {string} guardianEmail - Guardian email address
 * @returns {Promise<Array>} Array of pending invite objects
 * @throws {Error} Firebase error
 */
export async function fetchPendingInvites(guardianEmail) {
  console.log('[guardianInvites] fetchPendingInvites start', { guardianEmail });

  if (!guardianEmail) {
    const error = new Error('Guardian email is required');
    error.code = 'validation/missing-guardianEmail';
    throw error;
  }

  try {
    const invitesRef = collection(db, 'guardianInvites');
    const invitesQuery = query(
      invitesRef,
      where('guardianEmail', '==', guardianEmail.toLowerCase()),
      where('status', '==', 'pending')
    );

    const invitesSnap = await getDocs(invitesQuery);

    const invites = [];
    invitesSnap.forEach((doc) => {
      invites.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    console.log('[guardianInvites] Fetched pending invites:', invites.length);
    return invites;
  } catch (error) {
    console.error('[guardianInvites] fetchPendingInvites error:', error);
    throw error;
  }
}

/**
 * Accept a guardian invite - creates bidirectional relationships
 * @param {string} inviteId - Invite document ID
 * @param {string} guardianId - Guardian's Firebase user ID
 * @param {string} guardianEmail - Guardian's email
 * @returns {Promise<void>}
 * @throws {Error} Firebase or validation error
 */
export async function acceptInvite(inviteId, guardianId, guardianEmail) {
  console.log('[guardianInvites] acceptInvite start', { inviteId, guardianId });

  if (!inviteId || !guardianId || !guardianEmail) {
    const error = new Error('Invite ID, Guardian ID, and Guardian Email are required');
    error.code = 'validation/missing-fields';
    throw error;
  }

  try {
    // Get invite document
    const inviteDocRef = doc(db, 'guardianInvites', inviteId);
    const inviteSnap = await getDoc(inviteDocRef);

    if (!inviteSnap.exists()) {
      const error = new Error('Invite not found');
      error.code = 'not-found';
      throw error;
    }

    const inviteData = inviteSnap.data();

    if (inviteData.status !== 'pending') {
      const error = new Error('This invite is no longer pending');
      error.code = 'validation/invite-not-pending';
      throw error;
    }

    // Verify guardian email matches (security check)
    if (inviteData.guardianEmail.toLowerCase() !== guardianEmail.toLowerCase()) {
      const error = new Error('Guardian email does not match invite');
      error.code = 'validation/email-mismatch';
      throw error;
    }

    // Mark invite accepted; a backend Cloud Function will perform
    // bidirectional linking securely with Admin SDK privileges.
    await updateDoc(inviteDocRef, {
      status: 'accepted',
      acceptedAt: serverTimestamp(),
      acceptedByUid: guardianId,
      acceptedByEmail: guardianEmail.toLowerCase(),
    });

    console.log('[guardianInvites] Invite marked accepted; awaiting backend linking');
  } catch (error) {
    console.error('[guardianInvites] acceptInvite error:', error);
    throw error;
  }
}

/**
 * Reject a guardian invite (delete it)
 * @param {string} inviteId - Invite document ID
 * @returns {Promise<void>}
 * @throws {Error} Firebase error
 */
export async function rejectInvite(inviteId) {
  console.log('[guardianInvites] rejectInvite start', { inviteId });

  if (!inviteId) {
    const error = new Error('Invite ID is required');
    error.code = 'validation/missing-inviteId';
    throw error;
  }

  try {
    const inviteDocRef = doc(db, 'guardianInvites', inviteId);

    // Verify invite exists
    const inviteSnap = await getDoc(inviteDocRef);
    if (!inviteSnap.exists()) {
      const error = new Error('Invite not found');
      error.code = 'not-found';
      throw error;
    }

    // Delete the invite
    await deleteDoc(inviteDocRef);

    console.log('[guardianInvites] Invite rejected successfully');
  } catch (error) {
    console.error('[guardianInvites] rejectInvite error:', error);
    throw error;
  }
}

/**
 * Map Firebase/validation error codes to user-friendly messages
 * @param {Error} error - Error object
 * @returns {string} User-friendly error message
 */
export function getInviteErrorMessage(error) {
  const errorCodeMap = {
    'validation/missing-fields': 'Missing required fields for invite',
    'validation/invalid-userEmail': 'Invalid user email address',
    'validation/invalid-guardianEmail': 'Invalid guardian email address',
    'validation/duplicate-invite': 'Invite already sent to this guardian',
    'validation/missing-guardianEmail': 'Guardian email is required',
    'validation/invite-not-pending': 'This invite is no longer pending',
    'validation/email-mismatch': 'Guardian email does not match the invite',
    'not-found': 'Invite or profile not found',
    'permission-denied': 'You do not have permission to perform this action',
    'network-request-failed': 'Network connection failed. Please try again.',
    unavailable: 'Service unavailable. Please try again later.',
  };

  const code = error.code || error.message;
  return errorCodeMap[code] || error.message || 'An error occurred. Please try again.';
}
