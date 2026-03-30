/**
 * Location Service Tests
 *
 * Tests for location services:
 * - Permission request flows
 * - Location tracking start/stop
 * - Error handling and edge cases
 * - Error message mapping
 */

/* global describe, it, expect, jest, beforeEach */

// ── Mock expo-location ──────────────────────────────────────────────────────
const mockWatchPositionAsync = jest.fn();
const mockGetForegroundPermissionsAsync = jest.fn();
const mockRequestForegroundPermissionsAsync = jest.fn();
const mockHasServicesEnabled = jest.fn();
const mockGetCurrentPositionAsync = jest.fn();

jest.mock('expo-location', () => ({
  watchPositionAsync: (...args) => mockWatchPositionAsync(...args),
  getForegroundPermissionsAsync: () => mockGetForegroundPermissionsAsync(),
  requestForegroundPermissionsAsync: () => mockRequestForegroundPermissionsAsync(),
  hasServicesEnabled: () => mockHasServicesEnabled(),
  getCurrentPositionAsync: (...args) => mockGetCurrentPositionAsync(...args),
  Accuracy: {
    Balanced: 3,
    High: 4,
    Highest: 5,
    Low: 2,
    Lowest: 1,
    BestForNavigation: 6,
  },
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({})),
  updateDoc: jest.fn(() => Promise.resolve()),
  serverTimestamp: jest.fn(() => new Date()),
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

// ── Import module under test ────────────────────────────────────────────────
const {
  requestLocationPermission,
  startLocationTracking,
  stopLocationTracking,
  getLocationErrorMessage,
  checkLocationPermission,
  getCurrentLocation,
} = require('../src/services/location');

// ─────────────────────────────────────────────────────────────────────────────
// Test Suites
// ─────────────────────────────────────────────────────────────────────────────

describe('locationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── requestLocationPermission ─────────────────────────────────────────────
  describe('requestLocationPermission', () => {
    it('should return granted:true when permission is granted', async () => {
      mockHasServicesEnabled.mockResolvedValueOnce(true);
      mockRequestForegroundPermissionsAsync.mockResolvedValueOnce({
        status: 'granted',
      });

      const result = await requestLocationPermission();

      expect(result.granted).toBe(true);
      expect(result.status).toBe('granted');
    });

    it('should return granted:false when location services are disabled', async () => {
      mockHasServicesEnabled.mockResolvedValueOnce(false);

      const result = await requestLocationPermission();

      expect(result.granted).toBe(false);
      expect(result.status).toBe('disabled');
      expect(result.message).toContain('Location services are disabled');
    });

    it('should return granted:false when permission is denied', async () => {
      mockHasServicesEnabled.mockResolvedValueOnce(true);
      mockRequestForegroundPermissionsAsync.mockResolvedValueOnce({
        status: 'denied',
      });

      const result = await requestLocationPermission();

      expect(result.granted).toBe(false);
      expect(result.status).toBe('denied');
    });

    it('should handle errors gracefully', async () => {
      mockHasServicesEnabled.mockRejectedValueOnce(new Error('Device error'));

      const result = await requestLocationPermission();

      expect(result.granted).toBe(false);
      expect(result.status).toBe('error');
    });
  });

  // ── startLocationTracking ─────────────────────────────────────────────────
  describe('startLocationTracking', () => {
    it('should throw if userId is missing', async () => {
      await expect(startLocationTracking(null)).rejects.toThrow(
        'User ID is required',
      );
    });

    it('should throw if location services are disabled', async () => {
      mockHasServicesEnabled.mockResolvedValueOnce(false);

      await expect(startLocationTracking('uid-123')).rejects.toThrow(
        'Location services are disabled',
      );
    });

    it('should start watching position when permissions are granted', async () => {
      mockHasServicesEnabled.mockResolvedValueOnce(true);
      mockGetForegroundPermissionsAsync.mockResolvedValueOnce({
        status: 'granted',
      });

      const mockSubscription = { remove: jest.fn() };
      mockWatchPositionAsync.mockResolvedValueOnce(mockSubscription);

      const subscription = await startLocationTracking('uid-123');

      expect(subscription).toBe(mockSubscription);
      expect(mockWatchPositionAsync).toHaveBeenCalledTimes(1);

      // Verify watch config
      const watchConfig = mockWatchPositionAsync.mock.calls[0][0];
      expect(watchConfig.timeInterval).toBe(10000); // 10 seconds
    });

    it('should request permission if not already granted', async () => {
      mockHasServicesEnabled.mockResolvedValueOnce(true);
      mockGetForegroundPermissionsAsync.mockResolvedValueOnce({
        status: 'denied',
      });
      mockRequestForegroundPermissionsAsync.mockResolvedValueOnce({
        status: 'granted',
      });
      // After requesting, re-checking would internally call hasServicesEnabled, but
      // requestLocationPermission also calls hasServicesEnabled
      mockHasServicesEnabled.mockResolvedValueOnce(true);

      const mockSubscription = { remove: jest.fn() };
      mockWatchPositionAsync.mockResolvedValueOnce(mockSubscription);

      const subscription = await startLocationTracking('uid-123');
      expect(subscription).toBe(mockSubscription);
    });
  });

  // ── stopLocationTracking ──────────────────────────────────────────────────
  describe('stopLocationTracking', () => {
    it('should call remove on subscription', async () => {
      const mockSubscription = { remove: jest.fn() };

      await stopLocationTracking(mockSubscription);

      expect(mockSubscription.remove).toHaveBeenCalledTimes(1);
    });

    it('should handle null subscription gracefully', async () => {
      // Should not throw
      await expect(stopLocationTracking(null)).resolves.toBeUndefined();
    });
  });

  // ── getLocationErrorMessage ───────────────────────────────────────────────
  describe('getLocationErrorMessage', () => {
    it('should map known error codes to friendly messages', () => {
      const error = new Error();
      error.code = 'location/services-disabled';
      const msg = getLocationErrorMessage(error);
      expect(msg).toContain('Location services are disabled');
    });

    it('should map permission-denied error', () => {
      const error = new Error();
      error.code = 'location/permission-denied';
      const msg = getLocationErrorMessage(error);
      expect(msg).toContain('Location permission is required');
    });

    it('should return error.message for unknown codes', () => {
      const error = new Error('Something unexpected');
      const msg = getLocationErrorMessage(error);
      expect(msg).toBe('Something unexpected');
    });
  });

  // ── checkLocationPermission ───────────────────────────────────────────────
  describe('checkLocationPermission', () => {
    it('should return true when permissions are granted', async () => {
      mockGetForegroundPermissionsAsync.mockResolvedValueOnce({
        status: 'granted',
      });

      const result = await checkLocationPermission();
      expect(result).toBe(true);
    });

    it('should return false when permissions are denied', async () => {
      mockGetForegroundPermissionsAsync.mockResolvedValueOnce({
        status: 'denied',
      });

      const result = await checkLocationPermission();
      expect(result).toBe(false);
    });
  });

  // ── getCurrentLocation ────────────────────────────────────────────────────
  describe('getCurrentLocation', () => {
    it('should return coords when successful', async () => {
      mockHasServicesEnabled.mockResolvedValueOnce(true);
      mockHasServicesEnabled.mockResolvedValueOnce(true);
      mockRequestForegroundPermissionsAsync.mockResolvedValueOnce({
        status: 'granted',
      });
      mockGetCurrentPositionAsync.mockResolvedValueOnce({
        coords: { latitude: 33.6844, longitude: 73.0479, accuracy: 10 },
      });

      const result = await getCurrentLocation();

      expect(result).toEqual({
        latitude: 33.6844,
        longitude: 73.0479,
        accuracy: 10,
      });
    });

    it('should return null when permission denied', async () => {
      mockHasServicesEnabled.mockResolvedValueOnce(true);
      mockHasServicesEnabled.mockResolvedValueOnce(true);
      mockRequestForegroundPermissionsAsync.mockResolvedValueOnce({
        status: 'denied',
      });

      const result = await getCurrentLocation();
      expect(result).toBeNull();
    });
  });
});
