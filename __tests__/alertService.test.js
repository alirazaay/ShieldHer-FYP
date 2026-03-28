/**
 * Alert Service Tests
 *
 * Tests for the core alert lifecycle:
 * - createAlert: parameter validation, Firestore document creation
 * - checkActiveAlert: cooldown logic
 * - dispatchSOSAlert: online vs offline dispatch paths
 * - Error handling
 */

/* global describe, it, expect, jest, beforeEach */

// ── Setup mocks before importing the module under test ──────────────────────
// The global mocks from setup.js handle Firebase; here we override specifics.

const mockSetDoc = jest.fn(() => Promise.resolve());
const mockGetDoc = jest.fn();
const mockGetDocs = jest.fn();
const mockDoc = jest.fn(() => ({ id: 'test-alert-id', path: 'alerts/test-alert-id' }));
const mockCollection = jest.fn(() => ({ id: 'alerts', path: 'alerts' }));
const mockQuery = jest.fn(() => ({}));
const mockWhere = jest.fn(() => ({}));
const mockServerTimestamp = jest.fn(() => new Date());

jest.mock('firebase/firestore', () => ({
  doc: (...args) => mockDoc(...args),
  collection: (...args) => mockCollection(...args),
  getDoc: (...args) => mockGetDoc(...args),
  getDocs: (...args) => mockGetDocs(...args),
  setDoc: (...args) => mockSetDoc(...args),
  updateDoc: jest.fn(() => Promise.resolve()),
  query: (...args) => mockQuery(...args),
  where: (...args) => mockWhere(...args),
  serverTimestamp: () => mockServerTimestamp(),
  onSnapshot: jest.fn(),
  initializeFirestore: jest.fn(() => ({})),
  enableIndexedDbPersistence: jest.fn(() => Promise.resolve()),
  setLogLevel: jest.fn(),
  enableNetwork: jest.fn(() => Promise.resolve()),
}));

jest.mock('../src/config/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'test-uid' } },
  app: { name: '[DEFAULT]' },
}));

jest.mock('../src/utils/errorHandler', () => ({
  handleAppError: jest.fn(),
}));

jest.mock('../src/utils/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../src/services/networkService', () => ({
  isOnline: jest.fn(() => Promise.resolve(true)),
}));

jest.mock('../src/services/smsService', () => ({
  sendOfflineEmergencySMS: jest.fn(() =>
    Promise.resolve({ sent: 1, failed: 0 }),
  ),
  cacheGuardiansForOffline: jest.fn(() => Promise.resolve()),
  getSMSErrorMessage: jest.fn(() => 'SMS failed'),
}));

jest.mock('../src/services/profile', () => ({
  fetchGuardians: jest.fn(() => Promise.resolve([])),
  fetchUserProfile: jest.fn(() =>
    Promise.resolve({ name: 'Test User' }),
  ),
}));

jest.mock('../src/services/alertHistoryService', () => ({
  createTimelineEvent: jest.fn(() => Promise.resolve()),
}));

// ── Import module under test ────────────────────────────────────────────────
const {
  createAlert,
  checkActiveAlert,
  fetchUserLocation,
} = require('../src/services/alertService');

// ─────────────────────────────────────────────────────────────────────────────
// Test Suites
// ─────────────────────────────────────────────────────────────────────────────

describe('alertService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── createAlert ───────────────────────────────────────────────────────────
  describe('createAlert', () => {
    it('should throw if userId is missing', async () => {
      await expect(createAlert(null, 33.68, 73.05)).rejects.toThrow(
        'User ID is required',
      );
    });

    it('should throw if location coordinates are missing', async () => {
      await expect(createAlert('uid-123', undefined, undefined)).rejects.toThrow(
        'Location coordinates are required',
      );
    });

    it('should create an alert document with correct data', async () => {
      mockDoc.mockReturnValueOnce({ id: 'new-alert-123' });

      const alertId = await createAlert('uid-123', 33.6844, 73.0479, 15);

      expect(alertId).toBe('new-alert-123');
      expect(mockSetDoc).toHaveBeenCalledTimes(1);

      const setDocCall = mockSetDoc.mock.calls[0];
      const alertData = setDocCall[1];

      expect(alertData.userId).toBe('uid-123');
      expect(alertData.alertType).toBe('SOS');
      expect(alertData.latitude).toBe(33.6844);
      expect(alertData.longitude).toBe(73.0479);
      expect(alertData.accuracy).toBe(15);
      expect(alertData.status).toBe('active');
    });

    it('should create a timeline event after alert creation', async () => {
      const { createTimelineEvent } = require('../src/services/alertHistoryService');
      mockDoc.mockReturnValueOnce({ id: 'timeline-alert-id' });

      await createAlert('uid-123', 33.6844, 73.0479);

      expect(createTimelineEvent).toHaveBeenCalledWith(
        'timeline-alert-id',
        'triggered',
        'uid-123',
        expect.objectContaining({
          latitude: 33.6844,
          longitude: 73.0479,
        }),
      );
    });
  });

  // ── checkActiveAlert ──────────────────────────────────────────────────────
  describe('checkActiveAlert', () => {
    it('should return false if userId is missing (fail-open)', async () => {
      const result = await checkActiveAlert(null);
      expect(result).toBe(false);
    });

    it('should return false when no active alerts exist', async () => {
      mockGetDocs.mockResolvedValueOnce({
        empty: true,
        forEach: jest.fn(),
      });

      const result = await checkActiveAlert('uid-123');
      expect(result).toBe(false);
    });

    it('should return true when a recent active alert exists (within 30s)', async () => {
      const recentTimestamp = Date.now() - 10000; // 10 seconds ago

      mockGetDocs.mockResolvedValueOnce({
        empty: false,
        forEach: (callback) => {
          callback({
            data: () => ({
              timestamp: { toMillis: () => recentTimestamp },
              status: 'active',
            }),
          });
        },
      });

      const result = await checkActiveAlert('uid-123');
      expect(result).toBe(true);
    });

    it('should return false when active alert is older than 30s', async () => {
      const oldTimestamp = Date.now() - 60000; // 60 seconds ago

      mockGetDocs.mockResolvedValueOnce({
        empty: false,
        forEach: (callback) => {
          callback({
            data: () => ({
              timestamp: { toMillis: () => oldTimestamp },
              status: 'active',
            }),
          });
        },
      });

      const result = await checkActiveAlert('uid-123');
      expect(result).toBe(false);
    });
  });

  // ── fetchUserLocation ─────────────────────────────────────────────────────
  describe('fetchUserLocation', () => {
    it('should throw if userId is missing', async () => {
      await expect(fetchUserLocation(null)).rejects.toThrow(
        'User ID is required',
      );
    });

    it('should throw if user document does not exist', async () => {
      mockGetDoc.mockResolvedValueOnce({
        exists: () => false,
      });

      await expect(fetchUserLocation('uid-123')).rejects.toThrow(
        'User document not found',
      );
    });

    it('should throw if location data is not available', async () => {
      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ fullName: 'Test' }), // no location field
      });

      await expect(fetchUserLocation('uid-123')).rejects.toThrow(
        'User location not available',
      );
    });

    it('should return location when available', async () => {
      const mockLocation = {
        latitude: 33.6844,
        longitude: 73.0479,
        accuracy: 10,
      };

      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ location: mockLocation }),
      });

      const result = await fetchUserLocation('uid-123');

      expect(result).toEqual(mockLocation);
      expect(result.latitude).toBe(33.6844);
      expect(result.longitude).toBe(73.0479);
    });
  });
});
