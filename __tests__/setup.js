/**
 * Jest Setup File for ShieldHer
 *
 * Mocks Firebase, Expo modules, and AsyncStorage
 * so that unit tests can run without real service connections.
 */

/* global jest */

// ─────────────────────────────────────────────────────────────────────────────
// Mock: Firebase App
// ─────────────────────────────────────────────────────────────────────────────
jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(() => ({ name: '[DEFAULT]' })),
  getApps: jest.fn(() => []),
  getApp: jest.fn(() => ({ name: '[DEFAULT]' })),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Mock: Firebase Auth
// ─────────────────────────────────────────────────────────────────────────────
jest.mock('firebase/auth', () => ({
  initializeAuth: jest.fn(() => ({
    currentUser: { uid: 'test-uid-123', email: 'test@test.com' },
  })),
  getReactNativePersistence: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  signInWithCustomToken: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  signOut: jest.fn(),
  onAuthStateChanged: jest.fn((auth, callback) => {
    callback({ uid: 'test-uid-123' });
    return jest.fn(); // unsubscribe
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Mock: Firestore
// ─────────────────────────────────────────────────────────────────────────────
const mockDocRef = { id: 'mock-doc-id', path: 'test/mock-doc-id' };
const mockCollectionRef = { id: 'test', path: 'test' };

jest.mock('firebase/firestore', () => ({
  initializeFirestore: jest.fn(() => ({})),
  enableIndexedDbPersistence: jest.fn(() => Promise.resolve()),
  setLogLevel: jest.fn(),
  enableNetwork: jest.fn(() => Promise.resolve()),
  doc: jest.fn(() => mockDocRef),
  collection: jest.fn(() => mockCollectionRef),
  getDoc: jest.fn(() =>
    Promise.resolve({
      exists: () => true,
      data: () => ({ role: 'user', fullName: 'Test User' }),
      id: 'mock-doc-id',
    }),
  ),
  getDocs: jest.fn(() =>
    Promise.resolve({
      empty: true,
      docs: [],
      forEach: jest.fn(),
    }),
  ),
  setDoc: jest.fn(() => Promise.resolve()),
  updateDoc: jest.fn(() => Promise.resolve()),
  deleteDoc: jest.fn(() => Promise.resolve()),
  query: jest.fn(() => ({})),
  where: jest.fn(() => ({})),
  onSnapshot: jest.fn(() => jest.fn()),
  serverTimestamp: jest.fn(() => new Date()),
  FieldValue: {
    serverTimestamp: jest.fn(),
    increment: jest.fn(),
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Mock: Firebase Storage
// ─────────────────────────────────────────────────────────────────────────────
jest.mock('firebase/storage', () => ({
  getStorage: jest.fn(() => ({})),
  ref: jest.fn(() => ({})),
  uploadBytesResumable: jest.fn(() => ({
    on: jest.fn(),
    snapshot: { ref: {} },
  })),
  getDownloadURL: jest.fn(() => Promise.resolve('https://mock-url.com/file.aac')),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Mock: AsyncStorage
// ─────────────────────────────────────────────────────────────────────────────
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
    clear: jest.fn(() => Promise.resolve()),
    getAllKeys: jest.fn(() => Promise.resolve([])),
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Mock: expo-location
// ─────────────────────────────────────────────────────────────────────────────
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(() =>
    Promise.resolve({ status: 'granted' }),
  ),
  getForegroundPermissionsAsync: jest.fn(() =>
    Promise.resolve({ status: 'granted' }),
  ),
  hasServicesEnabled: jest.fn(() => Promise.resolve(true)),
  getCurrentPositionAsync: jest.fn(() =>
    Promise.resolve({
      coords: { latitude: 33.6844, longitude: 73.0479, accuracy: 10 },
    }),
  ),
  watchPositionAsync: jest.fn(() =>
    Promise.resolve({ remove: jest.fn() }),
  ),
  Accuracy: {
    Balanced: 3,
    High: 4,
    Highest: 5,
    Low: 2,
    Lowest: 1,
    BestForNavigation: 6,
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Mock: expo-constants
// ─────────────────────────────────────────────────────────────────────────────
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        firebaseApiKey: 'mock-api-key',
        firebaseAuthDomain: 'mock.firebaseapp.com',
        firebaseProjectId: 'mock-project',
        firebaseStorageBucket: 'mock.appspot.com',
        firebaseMessagingSenderId: '123456',
        firebaseAppId: '1:123:web:abc',
      },
    },
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Mock: @react-native-community/netinfo
// ─────────────────────────────────────────────────────────────────────────────
jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(() =>
    Promise.resolve({ isConnected: true, isInternetReachable: true }),
  ),
  addEventListener: jest.fn(() => jest.fn()),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Suppress console noise in tests
// setupFiles run before Jest globals are available, so we override directly.
// ─────────────────────────────────────────────────────────────────────────────
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.error = (...args) => {
  // Suppress known expected warnings in tests
  if (typeof args[0] === 'string' && args[0].includes('[Error isolated in')) return;
  originalConsoleError(...args);
};

console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('Persistence error')) return;
  originalConsoleWarn(...args);
};

