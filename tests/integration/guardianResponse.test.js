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

const makeDbMock = () => {
  const userProfiles = {
    'user-123': { fullName: 'Sara Ahmed' },
    'guardian-001': {
      fcmToken: 'ExponentPushToken[guardian-001]',
      notificationPreferences: { pushNotifications: true, guardianAlerts: true },
    },
  };

  const guardianDocs = [
    {
      id: 'guardian-001',
      data: () => ({ status: 'active', isRegisteredUser: true, name: 'Amna' }),
    },
  ];

  return {
    collection: jest.fn((name) => {
      if (name === 'users') {
        return {
          doc: (uid) => ({
            get: async () => ({
              exists: Boolean(userProfiles[uid]),
              data: () => userProfiles[uid] || {},
            }),
            collection: (sub) => {
              if (sub === 'guardians' && uid === 'user-123') {
                return {
                  get: async () => ({ docs: guardianDocs }),
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
        doc: () => ({
          get: async () => ({ exists: false, data: () => ({}) }),
          set: async () => {},
        }),
      };
    }),
  };
};

const mockGetFirestore = jest.fn(() => makeDbMock());

jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
}), { virtual: true });

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mockGetFirestore(),
  FieldValue: {
    serverTimestamp: jest.fn(() => new Date()),
  },
}), { virtual: true });

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => ({
    createCustomToken: jest.fn(async () => 'custom-token'),
    getUserByPhoneNumber: jest.fn(async () => {
      throw Object.assign(new Error('not found'), { code: 'auth/user-not-found' });
    }),
    createUser: jest.fn(async () => ({ uid: 'new-user' })),
  })),
}), { virtual: true });

describe('guardian notification integration', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('sends guardian push notifications when SOS alert is created', async () => {
    const functions = require('../../functions/index');

    await functions.onAlertCreated({
      params: { alertId: 'alert-001' },
      data: {
        data: () => ({
          userId: 'user-123',
          alertType: 'SOS',
          latitude: 33.6844,
          longitude: 73.0479,
        }),
      },
    });

    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    const sentPayload = mockAxiosPost.mock.calls[0][1];

    expect(Array.isArray(sentPayload)).toBe(true);
    expect(sentPayload[0].to).toBe('ExponentPushToken[guardian-001]');
    expect(sentPayload[0].title).toContain('Emergency SOS Alert');
    expect(mockEnqueueEscalation).toHaveBeenCalledTimes(1);
  });
});
