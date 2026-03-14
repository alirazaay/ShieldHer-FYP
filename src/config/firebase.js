// Firebase initialization for ShieldHer (Expo compatible)
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, enableIndexedDbPersistence, setLogLevel, enableNetwork } from 'firebase/firestore';

// TODO: Replace with your real Firebase project credentials (keep out of version control if sensitive)

const firebaseConfig = {
  apiKey: "AIzaSyBUPwigW1t_gz0TDojrFWCaQYIAab9Y7cg",
  authDomain: "shieldher-fyp.firebaseapp.com",
  projectId: "shieldher-fyp",
  storageBucket: "shieldher-fyp.firebasestorage.app",
  messagingSenderId: "711481799503",
  appId: "1:711481799503:web:887290a05427acff3ccb3a",
  measurementId: "G-HQE3L7PDQS"
};


// Debug: before init
try {
  const existing = getApps();
  console.log('[firebase] Existing apps before init:', existing.map(a => a.name));
} catch (e) {
  console.warn('[firebase] getApps() failed before init:', e);
}

// Use existing app if already initialized (prevents auth/configuration-not-found in hot reload)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
console.log('[firebase] Firebase initialized:', app.name);

// Initialize Firestore with long polling for React Native/Expo compatibility
const firestoreDb = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  // Some RN/Expo setups benefit from disabling fetch streams
  useFetchStreams: false,
});
console.log('[firebase] Firestore initialized with long polling');

// Optional: enable persistence (may not be supported on React Native; safe to ignore with catch)
enableIndexedDbPersistence(firestoreDb).catch((err) => {
  console.warn('[firebase] Persistence error (expected on RN in some cases):', err?.code || err?.message || err);
});

export const auth = getAuth(app);
export const db = firestoreDb;
// Optional: ensure network is enabled (in case it was previously disabled)
enableNetwork(db).catch((err) => console.warn('[firebase] enableNetwork failed:', err?.code || err?.message || err));

// Optional verbose logging in dev to diagnose connectivity
try {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    setLogLevel('debug');
  }
} catch {}

export { app };
