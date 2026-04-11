import {
  db,
  collection,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from '../config/firebase';

// ============================================================
// SUBSCRIPTIONS (Real-time listeners — return unsubscribe fn)
// ============================================================

/**
 * Subscribe to all alerts (real-time)
 * Ordered by creation time, newest first
 */
export function subscribeToAlerts(callback, statusFilter = null) {
  let q;
  if (statusFilter && statusFilter !== 'all') {
    q = query(
      collection(db, 'alerts'),
      where('status', '==', statusFilter),
      orderBy('createdAt', 'desc')
    );
  } else {
    q = query(collection(db, 'alerts'), orderBy('createdAt', 'desc'));
  }

  return onSnapshot(q, (snapshot) => {
    const alerts = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    callback(alerts);
  }, (error) => {
    console.error('Error subscribing to alerts:', error);
    callback([]);
  });
}

/**
 * Subscribe to police-escalated alerts (real-time)
 */
export function subscribeToPoliceAlerts(callback) {
  const q = query(
    collection(db, 'policeAlerts'),
    orderBy('escalatedAt', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const alerts = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    callback(alerts);
  }, (error) => {
    console.error('Error subscribing to policeAlerts:', error);
    callback([]);
  });
}

/**
 * Subscribe to all registered users (real-time)
 */
export function subscribeToUsers(callback) {
  const q = query(collection(db, 'users'));

  return onSnapshot(q, (snapshot) => {
    const users = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    callback(users);
  }, (error) => {
    console.error('Error subscribing to users:', error);
    callback([]);
  });
}

/**
 * Subscribe to police units (real-time)
 */
export function subscribeToPoliceUnits(callback) {
  const q = query(collection(db, 'policeUnits'));

  return onSnapshot(q, (snapshot) => {
    const units = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    callback(units);
  }, (error) => {
    console.error('Error subscribing to policeUnits:', error);
    callback([]);
  });
}

// ============================================================
// SINGLE DOCUMENT FETCHES
// ============================================================

/**
 * Get a single user profile by UID
 */
export async function getUserById(uid) {
  try {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
      return { id: userDoc.id, ...userDoc.data() };
    }
    return null;
  } catch (error) {
    console.error('Error fetching user:', error);
    return null;
  }
}

/**
 * Get a single alert by ID
 */
export async function getAlertById(alertId) {
  try {
    const alertDoc = await getDoc(doc(db, 'alerts', alertId));
    if (alertDoc.exists()) {
      return { id: alertDoc.id, ...alertDoc.data() };
    }
    return null;
  } catch (error) {
    console.error('Error fetching alert:', error);
    return null;
  }
}

/**
 * Get guardians for a user
 */
export async function getUserGuardians(userId) {
  try {
    const guardiansSnapshot = await getDocs(
      collection(db, 'users', userId, 'guardians')
    );
    return guardiansSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error('Error fetching guardians:', error);
    return [];
  }
}

// ============================================================
// ALERT ACTIONS
// ============================================================

/**
 * Update alert status (resolve, respond, cancel)
 */
export async function updateAlertStatus(alertId, status, officerUid = null) {
  try {
    const updateData = {
      status: status,
      updatedAt: serverTimestamp(),
    };
    if (status === 'resolved') {
      updateData.resolvedAt = serverTimestamp();
      if (officerUid) updateData.resolvedBy = officerUid;
    }
    if (status === 'responded') {
      updateData.respondedAt = serverTimestamp();
      if (officerUid) updateData.respondedBy = officerUid;
    }
    await updateDoc(doc(db, 'alerts', alertId), updateData);
    return true;
  } catch (error) {
    console.error('Error updating alert status:', error);
    throw error;
  }
}

/**
 * Update police alert status and assign unit
 */
export async function updatePoliceAlert(policeAlertId, data) {
  try {
    await updateDoc(doc(db, 'policeAlerts', policeAlertId), {
      ...data,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error('Error updating police alert:', error);
    throw error;
  }
}

// ============================================================
// UNIT MANAGEMENT
// ============================================================

/**
 * Create a new police unit
 */
export async function createPoliceUnit(unitData) {
  try {
    const docRef = await addDoc(collection(db, 'policeUnits'), {
      ...unitData,
      status: 'available',
      currentAlertId: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating police unit:', error);
    throw error;
  }
}

/**
 * Update a police unit's status
 */
export async function updateUnitStatus(unitId, status, alertId = null) {
  try {
    const updateData = {
      status: status,
      updatedAt: serverTimestamp(),
    };
    if (alertId !== undefined) {
      updateData.currentAlertId = alertId;
    }
    await updateDoc(doc(db, 'policeUnits', unitId), updateData);
    return true;
  } catch (error) {
    console.error('Error updating unit status:', error);
    throw error;
  }
}

/**
 * Assign a unit to an alert (updates both documents)
 */
export async function assignUnitToAlert(unitId, alertId, policeAlertId, officerUid) {
  try {
    // Update police unit → dispatched
    await updateDoc(doc(db, 'policeUnits', unitId), {
      status: 'dispatched',
      currentAlertId: alertId,
      updatedAt: serverTimestamp(),
    });

    // Update police alert → assigned
    if (policeAlertId) {
      await updateDoc(doc(db, 'policeAlerts', policeAlertId), {
        assignedUnitId: unitId,
        assignedAt: serverTimestamp(),
        respondedBy: officerUid,
        status: 'assigned',
        updatedAt: serverTimestamp(),
      });
    }

    // Update main alert → responded
    await updateDoc(doc(db, 'alerts', alertId), {
      status: 'responded',
      respondedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return true;
  } catch (error) {
    console.error('Error assigning unit to alert:', error);
    throw error;
  }
}

/**
 * Resolve an alert and free the assigned unit
 */
export async function resolveAlert(alertId, policeAlertId, unitId, officerUid) {
  try {
    // Update main alert
    await updateDoc(doc(db, 'alerts', alertId), {
      status: 'resolved',
      resolvedAt: serverTimestamp(),
      resolvedBy: officerUid,
      updatedAt: serverTimestamp(),
    });

    // Update police alert
    if (policeAlertId) {
      await updateDoc(doc(db, 'policeAlerts', policeAlertId), {
        status: 'closed',
        closedAt: serverTimestamp(),
        closedBy: officerUid,
        updatedAt: serverTimestamp(),
      });
    }

    // Free the unit
    if (unitId) {
      await updateDoc(doc(db, 'policeUnits', unitId), {
        status: 'available',
        currentAlertId: null,
        updatedAt: serverTimestamp(),
      });
    }

    return true;
  } catch (error) {
    console.error('Error resolving alert:', error);
    throw error;
  }
}

// ============================================================
// STATS / ANALYTICS
// ============================================================

/**
 * Get alert counts by status (for dashboard cards)
 */
export function subscribeToAlertStats(callback) {
  const q = query(collection(db, 'alerts'));

  return onSnapshot(q, (snapshot) => {
    const stats = {
      active: 0,
      responded: 0,
      resolved: 0,
      escalated: 0,
      cancelled: 0,
      total: snapshot.size,
    };
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (stats[data.status] !== undefined) {
        stats[data.status]++;
      }
    });
    callback(stats);
  }, (error) => {
    console.error('Error subscribing to alert stats:', error);
    callback({ active: 0, responded: 0, resolved: 0, escalated: 0, cancelled: 0, total: 0 });
  });
}

/**
 * Get alerts within a date range (for reports)
 */
export async function getAlertsInRange(startDate, endDate) {
  try {
    const q = query(
      collection(db, 'alerts'),
      where('createdAt', '>=', Timestamp.fromDate(startDate)),
      where('createdAt', '<=', Timestamp.fromDate(endDate)),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error('Error fetching alerts in range:', error);
    return [];
  }
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Format Firestore timestamp to readable string
 */
export function formatTimestamp(timestamp) {
  if (!timestamp) return 'Unknown';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Format Firestore timestamp to a date string
 */
export function formatDate(timestamp) {
  if (!timestamp) return 'N/A';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
