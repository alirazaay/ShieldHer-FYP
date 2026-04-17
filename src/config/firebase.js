// firebase.js – ShieldHer Expo compatible
// Firebase configuration loaded from environment variables via app.config.js
// Exports: app, db, auth, storage

import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentSingleTabManager,
  setLogLevel,
  enableNetwork,
} from 'firebase/firestore';
import { Platform } from 'react-native';
import { getStorage } from 'firebase/storage';
import Constants from 'expo-constants';
import logger from '../utils/logger';

const TAG = '[firebase]';

// Get Firebase config from environment variables (via app.config.js -> extra)
const expoConfig = Constants.expoConfig?.extra || Constants.manifest?.extra || {};

const firebaseConfig = {
  apiKey: expoConfig.firebaseApiKey,
  authDomain: expoConfig.firebaseAuthDomain,
  projectId: expoConfig.firebaseProjectId,
  storageBucket: expoConfig.firebaseStorageBucket,
  messagingSenderId: expoConfig.firebaseMessagingSenderId,
  appId: expoConfig.firebaseAppId,
  measurementId: expoConfig.firebaseMeasurementId,
};

// Validate that Firebase config is properly loaded
const isConfigValid = firebaseConfig.apiKey && firebaseConfig.projectId;
if (!isConfigValid) {
  const errorMsg =
    'Firebase configuration is missing! Ensure .env exists and is loaded via app.config.js. ' +
    'Check FIREBASE_API_KEY and FIREBASE_PROJECT_ID.';
  logger.error(TAG, errorMsg);
  throw new Error(errorMsg);
}

// Use existing app if already initialized (prevents hot reload issues)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
logger.info(TAG, 'Firebase initialized:', app.name);

// Use persistent IndexedDB cache on web and memory cache on native.
// React Native runtimes do not provide full IndexedDB support.
const localCache =
  Platform.OS === 'web'
    ? persistentLocalCache({ tabManager: persistentSingleTabManager() })
    : memoryLocalCache();

const db = initializeFirestore(app, {
  localCache,
  experimentalForceLongPolling: true,
  useFetchStreams: false,
});
logger.info(
  TAG,
  `Firestore initialized with ${Platform.OS === 'web' ? 'persistent' : 'memory'} cache + long polling`
);

// Initialize Firebase Auth with AsyncStorage persistence
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

// Ensure network is enabled
enableNetwork(db).catch((err) => {
  logger.warn(TAG, 'enableNetwork failed:', err?.code || err?.message || err);
});

// Enable debug logging only in development
if (__DEV__) {
  try {
    setLogLevel('warn'); // Use 'warn' instead of 'debug' to reduce noise
  } catch (error) {
    logger.warn(TAG, 'Failed to set log level:', error);
  }
}

// Initialize Firebase Storage for audio evidence uploads
const storage = getStorage(app);
logger.info(TAG, 'Firebase Storage initialized');

export { app, db, storage };
