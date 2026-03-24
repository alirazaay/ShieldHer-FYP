import { doc, getDoc, enableNetwork } from 'firebase/firestore';
import { db } from '../config/firebase';

export async function checkFirebaseConnection() {
  try {
    await enableNetwork(db);
  } catch (e) {
    console.warn('[check] enableNetwork skipped/failed:', e?.code || e?.message || e);
  }
  try {
    // Use a non-reserved collection name for connectivity check
    const pingRef = doc(db, '_connectivity_check', 'ping');
    const snap = await getDoc(pingRef);
    console.log('[check] Firestore connectivity ok. Doc exists:', snap.exists());
  } catch (e) {
    // Permission errors here are expected when rules deny this doc to anonymous users,
    // so log as a warning instead of an app-level error.
    if (e?.code === 'permission-denied') {
      console.warn('[check] Firestore connectivity limited by security rules:', e?.message || e);
    } else {
      console.error('[check] Firestore connectivity error:', e);
    }
  }
}
