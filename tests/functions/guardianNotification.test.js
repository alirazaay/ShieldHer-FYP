/* global describe, it, expect, beforeEach, jest */

global.__DEV__ = true;

jest.mock('firebase-functions/v2/firestore', () => ({
  onDocumentCreated: jest.fn((_, handler) => handler),
  onDocumentUpdated: jest.fn((_, handler) => handler),
}), { virtual: true });

jest.mock('firebase-functions/v2/https', () => ({
  onRequest: jest.fn((_, handler) => handler),
}), { virtual: true });

jest.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: jest.fn((_, handler) => handler),
}), { virtual: true });

const mockAxiosPost = jest.fn(async () => ({ data: { data: [{ status: 'ok' }] } }));
jest.mock('axios', () => ({
  post: (...args) => mockAxiosPost(...args),
}), { virtual: true });

const mockEnqueueEscalation = jest.fn(async () => {});
const mockProcessDueEscalations = jest.fn(async () => ({ processed: 0, escalated: 0 }));

jest.mock('../../functions/escalationService', () => ({
  enqueueEscalation: (...args) => mockEnqueueEscalation(...args),
  processDueEscalations: (...args) => mockProcessDueEscalations(...args),
}));

function mockBuildDbMock() {
  const users = {
    u1: { fullName: 'Ayesha' },
    g1: {
      fcmToken: 'ExponentPushToken[g1]',
      notificationPreferences: { pushNotifications: true, guardianAlerts: true },
    },
  };

  return {
    collection: (name) => {
      if (name === 'users') {
        return {
          doc: (id) => ({
            get: async () => ({ exists: Boolean(users[id]), data: () => users[id] || {} }),
            collection: (sub) => {
              if (sub === 'guardians' && id === 'u1') {
                return {
                  get: async () => ({
                    docs: [{ id: 'g1', data: () => ({ status: 'active', isRegisteredUser: true }) }],
                  }),
                };
              }
              return { get: async () => ({ docs: [] }) };
            },
          }),
        };
      }

      if (name === 'alerts') {
        return {
          doc: () => ({ set: async () => {} }),
        };
      }

      return {
        doc: () => ({ set: async () => {}, get: async () => ({ exists: false, data: () => ({}) }) }),
      };
    },
  };
}

jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
}), { virtual: true });

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => mockBuildDbMock()),
  FieldValue: {
    serverTimestamp: jest.fn(() => new Date()),
  },
}), { virtual: true });

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => ({
    createCustomToken: jest.fn(async () => 'token'),
    getUserByPhoneNumber: jest.fn(async () => {
      throw Object.assign(new Error('no user'), { code: 'auth/user-not-found' });
    }),
    createUser: jest.fn(async () => ({ uid: 'u-created' })),
  })),
}), { virtual: true });

describe('Cloud Function: onAlertCreated', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('sends guardian notification and queues escalation', async () => {
    const fns = require('../../functions/index');

    await fns.onAlertCreated({
      params: { alertId: 'alert-1' },
      data: {
        data: () => ({ userId: 'u1', alertType: 'SOS', latitude: 33.6, longitude: 73.0 }),
      },
    });

    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    expect(mockEnqueueEscalation).toHaveBeenCalledTimes(1);

    const payload = mockAxiosPost.mock.calls[0][1];
    expect(payload[0].to).toBe('ExponentPushToken[g1]');
  });
});
