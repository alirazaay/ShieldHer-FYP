// firebaseSetup.js – ShieldHer Expo compatible
import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeFirestore, enableIndexedDbPersistence, setLogLevel, enableNetwork } from 'firebase/firestore';

// TODO: Replace with your real Firebase project credentials
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

// Use existing app if already initialized (prevents hot reload issues)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
console.log('[firebase] Firebase initialized:', app.name);

// Initialize Firestore with long polling (Expo/React Native)
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  useFetchStreams: false,
});
console.log('[firebase] Firestore initialized with long polling');

// Optional: IndexedDB persistence (will fail on RN/Expo – safe to ignore)
enableIndexedDbPersistence(db).catch((err) => {
  console.warn('[firebase] Persistence error (expected on RN):', err?.code || err?.message || err);
});

// Initialize Firebase Auth with AsyncStorage persistence
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

// Ensure network is enabled
enableNetwork(db).catch((err) => console.warn('[firebase] enableNetwork failed:', err?.code || err?.message || err));

// Optional: debug logging in dev
try {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    setLogLevel('debug');
  }
} catch {}

export { app, db };
