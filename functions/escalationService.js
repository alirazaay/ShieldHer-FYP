/**
 * Escalation Service for ShieldHer Cloud Functions
 *
 * Replaces in-process sleep timers with queue + scheduled processing.
 * Flow:
 * 1) New SOS alert -> enqueueEscalation(alertId)
 * 2) Scheduler (every minute) -> processDueEscalations()
 * 3) Due/active alerts are escalated to policeAlerts + authorities notified
 */

const ESCALATION_TIMEOUT_MS = 90 * 1000; // 90 seconds
const ESCALATION_BATCH_LIMIT = 50;

/**
 * Queue escalation metadata on alert document.
 * @param {string} alertId
 * @param {Object} db - Firestore Admin SDK instance
 */
async function enqueueEscalation(alertId, db) {
  const escalationDueAt = new Date(Date.now() + ESCALATION_TIMEOUT_MS);

  await db.collection('alerts').doc(alertId).set(
    {
      escalationDueAt,
      escalationState: 'pending',
      escalationQueuedAt: new Date(),
    },
    { merge: true }
  );

  console.log(
    `[escalation] Queued alert ${alertId}. Escalation due at ${escalationDueAt.toISOString()}`
  );
}

/**
 * Process pending escalations due at or before now.
 * @param {Object} db - Firestore Admin SDK instance
 * @param {Function} sendExpoPushNotifications - Push helper
 * @returns {Promise<{processed:number, escalated:number}>}
 */
async function processDueEscalations(db, sendExpoPushNotifications) {
  const now = new Date();

  let dueSnap;
  try {
    // Preferred query narrows to pending escalations to reduce repeated scans.
    dueSnap = await db
      .collection('alerts')
      .where('status', '==', 'active')
      .where('escalationState', '==', 'pending')
      .where('escalationDueAt', '<=', now)
      .limit(ESCALATION_BATCH_LIMIT)
      .get();
  } catch (queryError) {
    // Backward-compatible fallback if composite index is not yet created.
    if (queryError.code === 9 || queryError.code === 'failed-precondition') {
      console.warn('[escalation] Optimized query unavailable, falling back to legacy query');
      dueSnap = await db
        .collection('alerts')
        .where('status', '==', 'active')
        .where('escalationDueAt', '<=', now)
        .limit(ESCALATION_BATCH_LIMIT)
        .get();
    } else {
      throw queryError;
    }
  }

  if (dueSnap.empty) {
    console.log('[escalation] No due alerts found');
    return { processed: 0, escalated: 0 };
  }

  let escalated = 0;
  for (const alertDoc of dueSnap.docs) {
    const didEscalate = await escalateIfStillActive(
      alertDoc.id,
      db,
      sendExpoPushNotifications
    );
    if (didEscalate) escalated++;
  }

  return { processed: dueSnap.size, escalated };
}

/**
 * Escalate a single alert if still active and not already escalated.
 * @param {string} alertId
 * @param {Object} db
 * @param {Function} sendExpoPushNotifications
 * @returns {Promise<boolean>} true if escalated in this run
 */
async function escalateIfStillActive(alertId, db, sendExpoPushNotifications) {
  try {
    const alertRef = db.collection('alerts').doc(alertId);
    const alertSnap = await alertRef.get();

    if (!alertSnap.exists) {
      console.log(`[escalation] Alert ${alertId} not found, skipping`);
      return false;
    }

    const alertData = alertSnap.data();

    if (alertData.status === 'cancelled') {
      console.log(`[escalation] Alert ${alertId} was cancelled by user, skipping`);
      return false;
    }

    if (alertData.escalationState && alertData.escalationState !== 'pending') {
      console.log(
        `[escalation] Alert ${alertId} escalationState is "${alertData.escalationState}", skipping`
      );
      return false;
    }

    if (alertData.status !== 'active') {
      console.log(
        `[escalation] Alert ${alertId} status is "${alertData.status}", skipping`
      );
      return false;
    }

    if (alertData.escalated === true) {
      console.log(`[escalation] Alert ${alertId} already escalated, skipping`);
      return false;
    }

    // ── Fetch user profile for context ──────────────────────────────────
    let userName = 'Unknown User';
    let userPhone = '';
    try {
      const userDoc = await db.collection('users').doc(alertData.userId).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        userName = userData.fullName || userData.email || 'Unknown User';
        userPhone = userData.phone || userData.phoneNumber || '';
      }
    } catch (err) {
      console.error('[escalation] Error fetching user profile:', err);
    }

    const policeAlertData = {
      alertId,
      userId: alertData.userId,
      userName,
      userPhone,
      userLocation: {
        latitude: alertData.latitude || null,
        longitude: alertData.longitude || null,
        accuracy: alertData.accuracy || null,
      },
      timestamp: new Date(),
      alertCreatedAt: alertData.timestamp || alertData.createdAt || new Date(),
      status: 'escalated',
      priority: 'high',
      escalatedAt: new Date(),
      acknowledged: false,
    };

    // Create police alert once (idempotent by alertId doc key)
    const policeRef = db.collection('policeAlerts').doc(alertId);
    try {
      await policeRef.create(policeAlertData);
      console.log(`[escalation] Police alert created: policeAlerts/${alertId}`);
    } catch (createErr) {
      // ALREADY_EXISTS means another processor already escalated it
      if (createErr.code === 6 || createErr.code === 'already-exists') {
        console.log(`[escalation] Police alert already exists for ${alertId}`);
      } else {
        throw createErr;
      }
    }

    await alertRef.update({
      escalated: true,
      escalatedAt: new Date(),
      escalationState: 'completed',
    });

    await notifyAuthorities(
      alertId,
      alertData,
      userName,
      db,
      sendExpoPushNotifications
    );

    return true;
  } catch (error) {
    console.error(`[escalation] Error escalating alert ${alertId}:`, error);
    return false;
  }
}

/**
 * Notify all registered authorities about escalated alert.
 * @param {string} alertId
 * @param {Object} alertData
 * @param {string} userName
 * @param {Object} db
 * @param {Function} sendExpoPushNotifications
 */
async function notifyAuthorities(alertId, alertData, userName, db, sendExpoPushNotifications) {
  try {
    const authoritiesSnap = await db.collection('authorities').get();

    if (authoritiesSnap.empty) {
      console.log('[escalation] No registered authorities found in Firestore');
      return;
    }

    const authorityTokens = [];
    authoritiesSnap.forEach((doc) => {
      const data = doc.data();
      if (data.fcmToken) authorityTokens.push(data.fcmToken);
    });

    if (authorityTokens.length === 0) {
      console.log('[escalation] No authority push tokens available');
      return;
    }

    const locationHint = alertData.latitude && alertData.longitude
      ? ` at (${parseFloat(alertData.latitude).toFixed(4)}, ${parseFloat(alertData.longitude).toFixed(4)})`
      : '';

    await sendExpoPushNotifications(
      authorityTokens,
      '🚨 ESCALATED: Emergency SOS Alert',
      `${userName} has an active SOS alert${locationHint} that has not been responded to. Immediate attention required.`,
      {
        screen: 'UserLocationMap',
        userId: alertData.userId,
        alertId,
        alertType: 'ESCALATED_SOS',
        priority: 'high',
      },
    );

    console.log(
      `[escalation] Notifications sent to ${authorityTokens.length} authority/ies`
    );
  } catch (notifError) {
    console.error('[escalation] Error notifying authorities:', notifError);
  }
}

module.exports = {
  ESCALATION_TIMEOUT_MS,
  enqueueEscalation,
  processDueEscalations,
};
