import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import {
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword,
  updateEmail,
} from 'firebase/auth';
import { auth, db } from '../config/firebase';

/**
 * Fetch user profile from Firestore
 * @param {string} uid - Firebase user ID
 * @returns {Promise<Object>} User profile object
 */
export async function fetchUserProfile(uid) {
  try {
    if (!uid) throw new Error('User ID is required');

    const userDocRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userDocRef);

    if (!userSnap.exists()) {
      throw new Error('User profile not found');
    }

    return {
      id: uid,
      ...userSnap.data(),
    };
  } catch (error) {
    console.error('[profile] fetchUserProfile error:', error);
    throw error;
  }
}

/**
 * Fetch all guardians for a user from subcollection
 * @param {string} uid - Firebase user ID
 * @returns {Promise<Array>} Array of guardian objects
 */
export async function fetchGuardians(uid) {
  try {
    if (!uid) throw new Error('User ID is required');

    const guardiansCollectionRef = collection(db, 'users', uid, 'guardians');
    const guardiansSnap = await getDocs(guardiansCollectionRef);

    const guardians = [];
    guardiansSnap.forEach((doc) => {
      guardians.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    return guardians;
  } catch (error) {
    console.error('[profile] fetchGuardians error:', error);
    throw error;
  }
}

/**
 * Update user profile in Firestore
 * @param {string} uid - Firebase user ID
 * @param {Object} updates - Profile fields to update
 * @returns {Promise<void>}
 */
export async function updateUserProfile(uid, updates) {
  try {
    if (!uid) throw new Error('User ID is required');

    // Validate email format if updating email
    if (updates.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(updates.email)) {
        throw new Error('Invalid email address');
      }
    }

    // Validate phone if updating
    if (updates.phone && updates.phone.length < 10) {
      throw new Error('Phone number must be at least 10 digits');
    }

    const userDocRef = doc(db, 'users', uid);
    const updateData = {
      ...updates,
      updatedAt: serverTimestamp(),
    };

    await updateDoc(userDocRef, updateData);

    console.log('[profile] User profile updated successfully');
  } catch (error) {
    console.error('[profile] updateUserProfile error:', error);
    throw error;
  }
}

/**
 * Add a new guardian to user's guardians subcollection
 *
 * NOTE: For push notifications to work, the guardian must be a registered user
 * and their UID must be used as the document ID. Use the invite flow for this.
 * Manual adds (without guardianUid) are for external contacts who don't have
 * the app - they won't receive in-app notifications.
 *
 * @param {string} userId - Firebase user ID (profile owner)
 * @param {Object} guardianData - Guardian information {name, phone, email, relationship}
 * @param {string} [guardianUid] - Optional: Guardian's Firebase UID (use for registered users)
 * @returns {Promise<string>} New guardian document ID
 */
export async function addGuardian(userId, guardianData, guardianUid = null) {
  try {
    if (!userId) throw new Error('User ID is required');
    if (!guardianData.name || !guardianData.phone || !guardianData.email) {
      throw new Error('Guardian name, phone, and email are required');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(guardianData.email)) {
      throw new Error('Invalid email address');
    }

    // Validate phone
    if (guardianData.phone.length < 10) {
      throw new Error('Phone number must be at least 10 digits');
    }

    // Check for duplicates (prevent adding same email twice)
    const guardiansCollectionRef = collection(db, 'users', userId, 'guardians');
    const duplicateQuery = query(
      guardiansCollectionRef,
      where('email', '==', guardianData.email.toLowerCase())
    );
    const duplicateSnap = await getDocs(duplicateQuery);

    if (!duplicateSnap.empty) {
      throw new Error('A guardian with this email already exists');
    }

    // Create guardian document
    // If guardianUid is provided, use it as doc ID (enables push notifications)
    // Otherwise, use auto-generated ID (for external contacts without app)
    const guardianDocRef = guardianUid
      ? doc(db, 'users', userId, 'guardians', guardianUid)
      : doc(guardiansCollectionRef);

    const guardianWithMetadata = {
      ...guardianData,
      email: guardianData.email.toLowerCase(),
      userId: userId,
      linkedAt: serverTimestamp(),
      status: 'active',
      // Flag to indicate if this guardian has a registered account
      isRegisteredUser: !!guardianUid,
    };

    await setDoc(guardianDocRef, guardianWithMetadata);

    console.log('[profile] Guardian added successfully:', guardianDocRef.id);
    return guardianDocRef.id;
  } catch (error) {
    console.error('[profile] addGuardian error:', error);
    throw error;
  }
}

/**
 * Remove a guardian from user's guardians subcollection
 * @param {string} userId - Firebase user ID
 * @param {string} guardianId - Guardian document ID
 * @returns {Promise<void>}
 */
export async function removeGuardian(userId, guardianId) {
  try {
    if (!userId || !guardianId) {
      throw new Error('User ID and Guardian ID are required');
    }

    const guardianDocRef = doc(db, 'users', userId, 'guardians', guardianId);
    await deleteDoc(guardianDocRef);

    console.log('[profile] Guardian removed successfully:', guardianId);
  } catch (error) {
    console.error('[profile] removeGuardian error:', error);
    throw error;
  }
}

/**
 * Update user's profile image URL
 * @param {string} uid - Firebase user ID
 * @param {string} imageUrl - Image URL to store
 * @returns {Promise<void>}
 */
export async function updateProfileImage(uid, imageUrl) {
  try {
    if (!uid) throw new Error('User ID is required');

    const userDocRef = doc(db, 'users', uid);
    await updateDoc(userDocRef, {
      profileImage: imageUrl,
      updatedAt: serverTimestamp(),
    });

    console.log('[profile] Profile image updated successfully');
  } catch (error) {
    console.error('[profile] updateProfileImage error:', error);
    throw error;
  }
}

/**
 * Change user's password (requires re-authentication)
 * @param {string} email - User's current email
 * @param {string} oldPassword - Current password
 * @param {string} newPassword - New password to set
 * @returns {Promise<void>}
 */
export async function changePassword(email, oldPassword, newPassword) {
  try {
    if (!email || !oldPassword || !newPassword) {
      throw new Error('Email, old password, and new password are required');
    }

    // Validate new password strength
    if (newPassword.length < 6) {
      throw new Error('New password must be at least 6 characters');
    }

    if (oldPassword === newPassword) {
      throw new Error('New password must be different from current password');
    }

    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    // Re-authenticate before changing password
    const credential = EmailAuthProvider.credential(email, oldPassword);
    await reauthenticateWithCredential(user, credential);

    // Update password
    await updatePassword(user, newPassword);

    console.log('[profile] Password changed successfully');
  } catch (error) {
    console.error('[profile] changePassword error:', error);
    throw error;
  }
}

/**
 * Fetch all connected users for a guardian (users who have accepted the guardian's invite)
 * @param {string} guardianId - Guardian's Firebase user ID
 * @returns {Promise<Array>} Array of connected user objects
 */
export async function getConnectedUsers(guardianId) {
  try {
    if (!guardianId) throw new Error('Guardian ID is required');

    const connectedUsersRef = collection(db, 'users', guardianId, 'connectedUsers');
    const connectedUsersSnap = await getDocs(connectedUsersRef);

    const connectedUsers = [];
    connectedUsersSnap.forEach((doc) => {
      connectedUsers.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    return connectedUsers;
  } catch (error) {
    console.error('[profile] getConnectedUsers error:', error);
    throw error;
  }
}

/**
 * Map Firebase error codes to user-friendly messages
 * @param {Error} error - Firebase error object
 * @returns {string} User-friendly error message
 */
export function getErrorMessage(error) {
  const errorCodeMap = {
    'auth/requires-recent-login': 'Please log in again to change password',
    'auth/weak-password': 'Password must be at least 6 characters',
    'auth/wrong-password': 'Current password is incorrect',
    'auth/invalid-email': 'Invalid email address',
    'auth/email-already-in-use': 'Email already in use',
    'auth/user-not-found': 'User account not found',
    'auth/operation-not-allowed': 'This operation is not allowed',
    'permission-denied': 'You do not have permission to perform this action',
    'not-found': 'Document not found',
    unavailable: 'Service unavailable. Please try again later.',
    'network-request-failed': 'Network connection failed. Check your internet.',
  };

  // Check for error code in custom message
  if (error.message && error.message.includes('Guardian')) {
    return error.message;
  }

  // Check for Firebase error code
  const code = error.code || error.message;
  return errorCodeMap[code] || error.message || 'An error occurred. Please try again.';
}

/**
 * Fetch the current state of Safety Mode
 * @param {string} uid - Firebase user ID
 * @returns {Promise<boolean>} Current safety mode state (true/false)
 */
export async function getSafetyModeState(uid) {
  try {
    if (!uid) return false;
    const userSnap = await getDoc(doc(db, 'users', uid));
    if (userSnap.exists()) {
      return !!userSnap.data()?.safetyModeEnabled;
    }
    return false;
  } catch (error) {
    console.error('[profile] getSafetyModeState error:', error);
    return false;
  }
}

/**
 * Toggle the user's Safety Mode (continuous background tracking wrapper)
 * @param {string} uid - Firebase user ID
 * @param {boolean} isEnabled - Toggle state
 * @returns {Promise<void>}
 */
export async function toggleSafetyMode(uid, isEnabled) {
  try {
    if (!uid) throw new Error('User ID is required');

    const userDocRef = doc(db, 'users', uid);
    await updateDoc(userDocRef, {
      safetyModeEnabled: isEnabled,
      updatedAt: serverTimestamp(),
    });

    console.log(`[profile] Safety Mode set to: ${isEnabled}`);
  } catch (error) {
    console.error('[profile] toggleSafetyMode error:', error);
    throw error;
  }
}

/**
 * Fetch the current state of Voice SOS
 * @param {string} uid - Firebase user ID
 * @returns {Promise<boolean>} Current voice mode state (true/false)
 */
export async function getVoiceSOSState(uid) {
  try {
    if (!uid) return false;
    const userSnap = await getDoc(doc(db, 'users', uid));
    if (userSnap.exists()) {
      return !!userSnap.data()?.voiceSOSEnabled;
    }
    return false;
  } catch (error) {
    console.error('[profile] getVoiceSOSState error:', error);
    return false;
  }
}

/**
 * Toggle the user's Voice SOS feature natively
 * @param {string} uid - Firebase user ID
 * @param {boolean} isEnabled - Toggle state
 * @returns {Promise<void>}
 */
export async function toggleVoiceSOS(uid, isEnabled) {
  try {
    if (!uid) throw new Error('User ID is required');

    const userDocRef = doc(db, 'users', uid);
    await updateDoc(userDocRef, {
      voiceSOSEnabled: isEnabled,
      updatedAt: serverTimestamp(),
    });

    console.log(`[profile] Voice SOS set to: ${isEnabled}`);
  } catch (error) {
    console.error('[profile] toggleVoiceSOS error:', error);
    throw error;
  }
}
