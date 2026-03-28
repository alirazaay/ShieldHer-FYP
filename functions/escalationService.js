/**
 * Escalation Service for ShieldHer Cloud Functions
 *
 * Handles automatic escalation of SOS alerts to local authorities.
 * When an alert remains active for ESCALATION_TIMEOUT_MS (90 seconds),
 * it creates a police alert record and sends notifications to registered authorities.
 */

const ESCALATION_TIMEOUT_MS = 90 * 1000; // 90 seconds

/**
 * Schedule an escalation check for a new alert.
 * Called from the onAlertCreated Cloud Function.
 *
 * After the timeout, re-checks the alert status.
 * If still active, creates a policeAlert document and notifies authorities.
 *
 * @param {string} alertId - Firestore alert document ID
 * @param {Object} alertData - Alert document data
 * @param {Object} db - Firestore Admin SDK instance
 * @param {Function} sendExpoPushNotifications - Push notification helper
 */
async function scheduleEscalation(alertId, alertData, db, sendExpoPushNotifications) {
  console.log(`[escalation] Scheduling escalation check for alert ${alertId} in ${ESCALATION_TIMEOUT_MS / 1000}s`);

  // Wait for the escalation timeout
  await new Promise((resolve) => setTimeout(resolve, ESCALATION_TIMEOUT_MS));

  // Re-check alert status after timeout
  try {
    const alertDoc = await db.collection('alerts').doc(alertId).get();

    if (!alertDoc.exists) {
      console.log(`[escalation] Alert ${alertId} no longer exists, skipping escalation`);
      return;
    }

    const currentData = alertDoc.data();
    const currentStatus = currentData.status;

    // Only escalate if alert is still active (not responded/resolved/cancelled)
    if (currentStatus !== 'active') {
      console.log(`[escalation] Alert ${alertId} status is "${currentStatus}", skipping escalation`);
      return;
    }

    console.log(`[escalation] Alert ${alertId} still active after ${ESCALATION_TIMEOUT_MS / 1000}s — ESCALATING`);

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

    // ── Create police alert document ────────────────────────────────────
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

    await db.collection('policeAlerts').doc(alertId).set(policeAlertData);
    console.log(`[escalation] Police alert created: policeAlerts/${alertId}`);

    // ── Update the original alert with escalation flag ──────────────────
    await db.collection('alerts').doc(alertId).update({
      escalated: true,
      escalatedAt: new Date(),
    });

    // ── Notify registered authorities ───────────────────────────────────
    // Fetch authority tokens from the 'authorities' collection
    try {
      const authoritiesSnap = await db.collection('authorities').get();

      if (!authoritiesSnap.empty) {
        const authorityTokens = [];
        authoritiesSnap.forEach((doc) => {
          const data = doc.data();
          if (data.fcmToken) {
            authorityTokens.push(data.fcmToken);
          }
        });

        if (authorityTokens.length > 0) {
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
              alertId: alertId,
              alertType: 'ESCALATED_SOS',
              priority: 'high',
            },
          );
          console.log(`[escalation] Notifications sent to ${authorityTokens.length} authority/ies`);
        } else {
          console.log('[escalation] No authority push tokens available');
        }
      } else {
        console.log('[escalation] No registered authorities found in Firestore');
      }
    } catch (notifError) {
      console.error('[escalation] Error notifying authorities:', notifError);
      // Don't throw – the policeAlert doc is already created
    }
  } catch (error) {
    console.error(`[escalation] Error during escalation for alert ${alertId}:`, error);
  }
}

module.exports = { scheduleEscalation, ESCALATION_TIMEOUT_MS };
