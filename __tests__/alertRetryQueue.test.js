/* global jest */

global.__DEV__ = true;

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

function loadModules() {
  jest.resetModules();

  const AsyncStorageModule = require('@react-native-async-storage/async-storage');
  const NetInfoModule = require('@react-native-community/netinfo');
  const queueModule = require('../src/services/alertRetryQueue');

  return {
    AsyncStorage: AsyncStorageModule.default || AsyncStorageModule,
    NetInfo: NetInfoModule.default || NetInfoModule,
    queue: queueModule,
  };
}

describe('alertRetryQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses exponential backoff after 5 failures', () => {
    const { queue } = loadModules();
    const { calculateRetryDelayMs } = queue;

    expect(calculateRetryDelayMs(1)).toBe(10000);
    expect(calculateRetryDelayMs(5)).toBe(10000);
    expect(calculateRetryDelayMs(6)).toBe(20000);
    expect(calculateRetryDelayMs(7)).toBe(40000);
    expect(calculateRetryDelayMs(10)).toBe(320000);
  });

  it('queues and retries successfully when online', async () => {
    const { AsyncStorage, NetInfo, queue } = loadModules();
    NetInfo.fetch.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    AsyncStorage.getItem.mockResolvedValue(null);

    const {
      initializeAlertRetryQueue,
      enqueuePendingAlert,
      retryPendingAlertsNow,
      getPendingAlerts,
      shutdownAlertRetryQueue,
    } = queue;

    const onSendAlert = jest.fn().mockResolvedValue(undefined);

    await initializeAlertRetryQueue({
      onSendAlert,
      onMaxRetriesReached: jest.fn(),
    });

    await enqueuePendingAlert({
      alertId: 'a1',
      userId: 'u1',
      location: { latitude: 1.23, longitude: 4.56 },
      timestamp: Date.now(),
      retries: 0,
    });

    const batchResult = await retryPendingAlertsNow('test');
    const remaining = await getPendingAlerts();

    expect(batchResult.delivered).toBe(1);
    expect(onSendAlert).toHaveBeenCalledTimes(1);
    expect(remaining).toHaveLength(0);

    shutdownAlertRetryQueue();
  });

  it('does not retry while offline and keeps queue intact', async () => {
    const { AsyncStorage, NetInfo, queue } = loadModules();
    NetInfo.fetch.mockResolvedValue({ isConnected: false, isInternetReachable: false });
    AsyncStorage.getItem.mockResolvedValue(null);

    const {
      initializeAlertRetryQueue,
      enqueuePendingAlert,
      retryPendingAlertsNow,
      getPendingAlerts,
      shutdownAlertRetryQueue,
    } = queue;

    await initializeAlertRetryQueue({
      onSendAlert: jest.fn().mockResolvedValue(undefined),
      onMaxRetriesReached: jest.fn(),
    });

    await enqueuePendingAlert({
      alertId: 'a2',
      userId: 'u2',
      location: { latitude: 9.87, longitude: 6.54 },
      timestamp: Date.now(),
      retries: 0,
    });

    const batchResult = await retryPendingAlertsNow('offline-test');
    const remaining = await getPendingAlerts();

    expect(batchResult.offline).toBe(true);
    expect(remaining).toHaveLength(1);

    shutdownAlertRetryQueue();
  });

  it('triggers SMS backup hook after max retries', async () => {
    const { AsyncStorage, NetInfo, queue } = loadModules();
    NetInfo.fetch.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    AsyncStorage.getItem.mockResolvedValue(null);

    const {
      initializeAlertRetryQueue,
      enqueuePendingAlert,
      retryPendingAlertsNow,
      getPendingAlerts,
      shutdownAlertRetryQueue,
    } = queue;

    const onMaxRetriesReached = jest.fn().mockResolvedValue(undefined);

    await initializeAlertRetryQueue({
      onSendAlert: jest.fn().mockRejectedValue(new Error('network timeout')),
      onMaxRetriesReached,
    });

    await enqueuePendingAlert({
      alertId: 'a3',
      userId: 'u3',
      location: { latitude: 7.77, longitude: 8.88 },
      timestamp: Date.now(),
      retries: 9,
    });

    const batchResult = await retryPendingAlertsNow('max-retry-test');
    const remaining = await getPendingAlerts();

    expect(batchResult.failed).toBe(1);
    expect(onMaxRetriesReached).toHaveBeenCalledTimes(1);
    expect(remaining).toHaveLength(0);

    shutdownAlertRetryQueue();
  });

  it('retries immediately when connectivity is restored', async () => {
    const { AsyncStorage, NetInfo, queue } = loadModules();
    AsyncStorage.getItem.mockResolvedValue(null);

    let online = false;
    NetInfo.fetch.mockImplementation(async () => ({
      isConnected: online,
      isInternetReachable: online,
    }));

    let connectivityCallback = null;
    NetInfo.addEventListener.mockImplementation((cb) => {
      connectivityCallback = cb;
      return jest.fn();
    });

    const {
      initializeAlertRetryQueue,
      enqueuePendingAlert,
      getPendingAlerts,
      shutdownAlertRetryQueue,
    } = queue;

    const onSendAlert = jest.fn().mockResolvedValue(undefined);

    await initializeAlertRetryQueue({
      onSendAlert,
      onMaxRetriesReached: jest.fn(),
    });

    await enqueuePendingAlert({
      alertId: 'a4',
      userId: 'u4',
      location: { latitude: 11.11, longitude: 22.22 },
      timestamp: Date.now(),
      retries: 0,
    });

    expect(onSendAlert).toHaveBeenCalledTimes(0);

    online = true;
    connectivityCallback({ isConnected: true, isInternetReachable: true });
    await flushPromises();

    const remaining = await getPendingAlerts();

    expect(onSendAlert).toHaveBeenCalledTimes(1);
    expect(remaining).toHaveLength(0);

    shutdownAlertRetryQueue();
  });
});
