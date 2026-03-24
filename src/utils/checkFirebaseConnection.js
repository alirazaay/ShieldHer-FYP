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
    console.error('[check] Firestore connectivity error:', e);
  }
}
