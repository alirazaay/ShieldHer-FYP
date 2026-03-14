import { doc, getDoc, enableNetwork } from 'firebase/firestore';
import { db } from '../config/firebase';

export async function checkFirebaseConnection() {
  try {
    await enableNetwork(db);
  } catch (e) {
    console.warn('[check] enableNetwork skipped/failed:', e?.code || e?.message || e);
  }
  try {
    const pingRef = doc(db, '__ping__', 'connect');
    const snap = await getDoc(pingRef);
    console.log('[check] Firestore connectivity ok. Doc exists:', snap.exists());
  } catch (e) {
    console.error('[check] Firestore connectivity error:', e);
  }
}
