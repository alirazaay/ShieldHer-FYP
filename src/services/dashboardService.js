import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { fetchGuardians, fetchUserProfile } from './profile';
import logger from '../utils/logger';

const TAG = '[dashboardService]';

function extractInitial(profile = {}) {
  const nameCandidate =
    profile.fullName || profile.name || profile.displayName || profile.email || 'U';
  const initial = String(nameCandidate).trim().charAt(0).toUpperCase();
  return initial || 'U';
}

function hasValidLocation(location) {
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude);
}

function pickPrimaryGuardian(guardians = []) {
  if (!Array.isArray(guardians) || guardians.length === 0) {
    return null;
  }

  const activeGuardian = guardians.find((guardian) => guardian?.status !== 'inactive');
  return activeGuardian || guardians[0];
}

export async function fetchUserDashboardSnapshot(userId) {
  if (!userId) {
    throw new Error('User ID is required');
  }

  try {
    const activeAlertQuery = query(
      collection(db, 'alerts'),
      where('userId', '==', userId),
      where('status', '==', 'active'),
      limit(1)
    );

    const [profile, guardians, activeAlertsSnap] = await Promise.all([
      fetchUserProfile(userId),
      fetchGuardians(userId),
      getDocs(activeAlertQuery),
    ]);

    const primaryGuardian = pickPrimaryGuardian(guardians);

    return {
      profile,
      profileInitial: extractInitial(profile),
      guardiansCount: guardians.length,
      primaryContactName:
        primaryGuardian?.name ||
        primaryGuardian?.fullName ||
        primaryGuardian?.displayName ||
        'No Contact',
      hasPrimaryContact: Boolean(primaryGuardian),
      hasActiveAlert: !activeAlertsSnap.empty,
      hasLiveLocation: hasValidLocation(profile?.location),
      safetyModeEnabled: Boolean(profile?.safetyModeEnabled),
    };
  } catch (error) {
    logger.error(TAG, 'fetchUserDashboardSnapshot error:', error);
    throw error;
  }
}
