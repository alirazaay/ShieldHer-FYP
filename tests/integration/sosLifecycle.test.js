/* global describe, it, expect, beforeEach, jest */

global.__DEV__ = true;

jest.mock('../../src/config/firebase', () => ({ db: {} }));

const mockStore = {
  alerts: {},
  events: {},
  idCounter: 0,
};

jest.mock('firebase/firestore', () => {
  const serverTimestamp = jest.fn(() => Date.now());
  const nextId = (prefix = 'id') => {
    mockStore.idCounter += 1;
    return `${prefix}_${mockStore.idCounter}`;
  };

  const collection = jest.fn((...parts) => ({
    __type: 'collection',
    path: parts
      .map((part) => (typeof part === 'string' ? part : ''))
      .filter(Boolean)
      .join('/'),
  }));

  const doc = jest.fn((...parts) => {
    if (parts.length === 1 && parts[0]?.__type === 'collection') {
      const id = nextId(parts[0].path.replace(/\//g, '_'));
      return { __type: 'doc', id, path: `${parts[0].path}/${id}` };
    }

    if (parts[0]?.__type === 'collection') {
      const base = parts[0].path;
      const id = parts[1] || nextId(base.replace(/\//g, '_'));
      return { __type: 'doc', id, path: `${base}/${id}` };
    }

    const filtered = parts.filter((part) => typeof part === 'string');
    const path = filtered.join('/');
    return { __type: 'doc', id: filtered[filtered.length - 1], path };
  });

  const getDoc = jest.fn(async (docRef) => {
    const path = docRef.path;
    const alertMatch = /^alerts\/([^/]+)$/.exec(path);
    if (alertMatch) {
      const id = alertMatch[1];
      const data = mockStore.alerts[id];
      return {
        id,
        exists: () => Boolean(data),
        data: () => data,
      };
    }

    const eventMatch = /^alerts\/([^/]+)\/events\/([^/]+)$/.exec(path);
    if (eventMatch) {
      const [, alertId, eventId] = eventMatch;
      const data = mockStore.events[alertId]?.[eventId];
      return {
        id: eventId,
        exists: () => Boolean(data),
        data: () => data,
      };
    }

    return {
      exists: () => false,
      data: () => null,
    };
  });

  const setDoc = jest.fn(async (docRef, payload, options = {}) => {
    const path = docRef.path;

    const alertMatch = /^alerts\/([^/]+)$/.exec(path);
    if (alertMatch) {
      const id = alertMatch[1];
      if (options.merge && mockStore.alerts[id]) {
        mockStore.alerts[id] = { ...mockStore.alerts[id], ...payload };
      } else {
        mockStore.alerts[id] = { ...payload };
      }
      return;
    }

    const eventMatch = /^alerts\/([^/]+)\/events\/([^/]+)$/.exec(path);
    if (eventMatch) {
      const [, alertId, eventId] = eventMatch;
      mockStore.events[alertId] = mockStore.events[alertId] || {};
      if (options.merge && mockStore.events[alertId][eventId]) {
        mockStore.events[alertId][eventId] = {
          ...mockStore.events[alertId][eventId],
          ...payload,
        };
      } else {
        mockStore.events[alertId][eventId] = { ...payload };
      }
    }
  });

  const updateDoc = jest.fn(async (docRef, payload) => {
    const alertMatch = /^alerts\/([^/]+)$/.exec(docRef.path);
    if (!alertMatch) return;
    const id = alertMatch[1];
    if (!mockStore.alerts[id]) {
      throw new Error('Alert not found');
    }
    mockStore.alerts[id] = {
      ...mockStore.alerts[id],
      ...payload,
    };
  });

  const query = jest.fn((...parts) => ({ __type: 'query', parts }));
  const where = jest.fn((...parts) => ({ __type: 'where', parts }));
  const getDocs = jest.fn(async () => ({
    empty: true,
    forEach: () => {},
    docs: [],
  }));
  const onSnapshot = jest.fn(() => jest.fn());

  return {
    doc,
    getDoc,
    setDoc,
    query,
    collection,
    where,
    getDocs,
    onSnapshot,
    updateDoc,
    serverTimestamp,
    __mockStore: mockStore,
  };
});

jest.mock('../../src/services/networkService', () => ({
  isOnline: jest.fn(async () => true),
}));

jest.mock('../../src/services/profile', () => ({
  fetchGuardians: jest.fn(async () => [{ id: 'guardian-1', name: 'Guardian' }]),
  fetchUserProfile: jest.fn(async () => ({ name: 'Test User' })),
}));

jest.mock('../../src/services/smsService', () => ({
  sendOfflineEmergencySMS: jest.fn(async () => ({ sent: 1, failed: 0, errors: [] })),
  cacheGuardiansForOffline: jest.fn(async () => {}),
  getSMSErrorMessage: jest.fn(() => null),
}));

jest.mock('../../src/services/alertRetryQueue', () => ({
  enqueuePendingAlert: jest.fn(async () => {}),
  initializeAlertRetryQueue: jest.fn(async () => ({ queueSize: 0 })),
  retryPendingAlertsNow: jest.fn(async () => ({ retried: 0, delivered: 0, failed: 0 })),
  shutdownAlertRetryQueue: jest.fn(() => {}),
}));

describe('SOS lifecycle integration', () => {
  beforeEach(() => {
    mockStore.alerts = {};
    mockStore.events = {};
    mockStore.idCounter = 0;
    jest.clearAllMocks();
  });

  it('creates an alert, allows guardian response, and resolves lifecycle', async () => {
    const { dispatchSOSAlert } = require('../../src/services/alertService');
    const { respondToAlert, resolveAlert } = require('../../src/services/alertLifecycleService');
    const firestore = require('firebase/firestore');

    const dispatchResult = await dispatchSOSAlert('user-123', {
      latitude: 33.6844,
      longitude: 73.0479,
      accuracy: 12,
    });

    expect(dispatchResult.success).toBe(true);
    expect(dispatchResult.method).toBe('firestore');
    expect(dispatchResult.deliveryStatus).toBe('sent');
    expect(dispatchResult.alertId).toBeTruthy();

    const createdAlert = firestore.__mockStore.alerts[dispatchResult.alertId];
    expect(createdAlert).toBeTruthy();
    expect(createdAlert.userId).toBe('user-123');
    expect(createdAlert.status).toBe('active');

    await respondToAlert(dispatchResult.alertId, 'guardian-456');
    expect(firestore.__mockStore.alerts[dispatchResult.alertId].status).toBe('responding');
    expect(firestore.__mockStore.alerts[dispatchResult.alertId].respondedBy).toBe('guardian-456');

    await resolveAlert(dispatchResult.alertId, 'guardian-456');
    expect(firestore.__mockStore.alerts[dispatchResult.alertId].status).toBe('resolved');
    expect(firestore.__mockStore.alerts[dispatchResult.alertId].resolvedBy).toBe('guardian-456');
  });
});
