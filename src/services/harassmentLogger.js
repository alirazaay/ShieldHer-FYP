import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../config/firebase';

// Tier definitions
// Mild    (0.75-0.84): Log only. No user-visible alert.
// Moderate(0.85-0.94): Prompt user to manually trigger SOS.
// High    (0.95-1.00): Auto-trigger SOS immediately.
export const HARASSMENT_TIERS = {
  MILD: { min: 0.75, max: 0.84, label: 'Mild', color: '#FFA500' },
  MODERATE: { min: 0.85, max: 0.94, label: 'Moderate', color: '#FF4500' },
  HIGH: { min: 0.95, max: 1.0, label: 'High', color: '#FF0000' },
};

export function classifyProb(prob) {
  if (prob >= HARASSMENT_TIERS.HIGH.min) return 'HIGH';
  if (prob >= HARASSMENT_TIERS.MODERATE.min) return 'MODERATE';
  if (prob >= HARASSMENT_TIERS.MILD.min) return 'MILD';
  return null;
}

export async function logHarassmentEvent({ prob, source, location }) {
  const tier = classifyProb(prob);
  if (!tier) return null;

  const uid = auth.currentUser?.uid;
  if (!uid) return null;

  const event = {
    uid,
    prob,
    tier,
    source,
    location: location ?? null,
    timestamp: serverTimestamp(),
    resolved: false,
  };

  const ref = await addDoc(collection(db, 'users', uid, 'harassmentEvents'), event);

  console.log(
    `[ShieldHer] Harassment event logged: tier=${tier}, prob=${Number(prob).toFixed(3)}, id=${ref.id}`
  );

  return { id: ref.id, tier, ...event };
}
