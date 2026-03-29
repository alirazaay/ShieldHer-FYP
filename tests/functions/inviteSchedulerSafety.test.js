/* global describe, it, expect, beforeEach, afterEach, jest */

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

jest.mock('axios', () => ({
  post: jest.fn(async () => ({ data: { data: [{ status: 'ok' }] } })),
}), { virtual: true });

const mockEnqueueEscalation = jest.fn(async () => {});
const mockProcessDueEscalations = jest.fn(async () => ({ processed: 0, escalated: 0 }));

jest.mock('../../functions/escalationService', () => ({
  enqueueEscalation: (...args) => mockEnqueueEscalation(...args),
  processDueEscalations: (...args) => mockProcessDueEscalations(...args),
}));

const dbScenario = {
  guardianDocExists: true,
  guardianDocEmail: 'guardian@example.com',
};

const guardianInviteWrites = [];

function mockBuildDbMock() {
  return {
    batch: () => ({
      set: jest.fn(),
      delete: jest.fn(),
      commit: jest.fn(async () => {}),
    }),
    collection: (name) => {
      if (name === 'guardianInvites') {
        return {
          doc: (id) => ({
            set: async (payload) => {
              guardianInviteWrites.push({ id, payload });
            },
          }),
        };
      }

      if (name === 'users') {
        return {
          doc: (id) => ({
            get: async () => {
              if (id === 'guardian-uid') {
                return {
                  exists: dbScenario.guardianDocExists,
                  data: () => ({ email: dbScenario.guardianDocEmail, fullName: 'Guardian Name' }),
                };
              }

              return {
                exists: true,
                data: () => ({ fullName: 'User Name', email: 'user@example.com' }),
              };
            },
            collection: () => ({
              doc: () => ({}),
            }),
          }),
        };
      }

      return {
        doc: () => ({
          set: async () => {},
          get: async () => ({ exists: false, data: () => ({}) }),
        }),
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

describe('Cloud Functions invite/scheduler safety', () => {
  let logSpy;
  let errorSpy;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    dbScenario.guardianDocExists = true;
    dbScenario.guardianDocEmail = 'guardian@example.com';
    guardianInviteWrites.length = 0;

    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('flags missing invite fields and avoids logging raw email payload', async () => {
    const fns = require('../../functions/index');

    await fns.onGuardianInviteAccepted({
      params: { inviteId: 'invite-1' },
      data: {
        before: { data: () => ({ status: 'pending' }) },
        after: {
          data: () => ({
            status: 'accepted',
            userId: 'u1',
            guardianEmail: 'guardian@example.com',
          }),
        },
      },
    });

    expect(guardianInviteWrites).toHaveLength(1);
    expect(guardianInviteWrites[0].id).toBe('invite-1');
    expect(guardianInviteWrites[0].payload.errorReason).toBe('missing-required-fields');

    const combinedLogs = [...logSpy.mock.calls, ...errorSpy.mock.calls]
      .flat()
      .map((entry) => String(entry))
      .join(' ');

    expect(combinedLogs).toContain('Missing required fields for invite:');
    expect(combinedLogs).toContain('invite-1');
    expect(combinedLogs).not.toContain('guardian@example.com');
  });

  it('flags guardian uid/email mismatch and avoids logging raw email values', async () => {
    const fns = require('../../functions/index');
    dbScenario.guardianDocEmail = 'different@example.com';

    await fns.onGuardianInviteAccepted({
      params: { inviteId: 'invite-2' },
      data: {
        before: { data: () => ({ status: 'pending' }) },
        after: {
          data: () => ({
            status: 'accepted',
            userId: 'u1',
            userEmail: 'user@example.com',
            userName: 'User Name',
            userPhone: '+923001112233',
            guardianEmail: 'guardian@example.com',
            acceptedByUid: 'guardian-uid',
            acceptedByEmail: 'guardian@example.com',
          }),
        },
      },
    });

    expect(guardianInviteWrites).toHaveLength(1);
    expect(guardianInviteWrites[0].id).toBe('invite-2');
    expect(guardianInviteWrites[0].payload.errorReason).toBe('guardian-uid-email-mismatch');

    const combinedLogs = [...logSpy.mock.calls, ...errorSpy.mock.calls]
      .flat()
      .map((entry) => String(entry))
      .join(' ');

    expect(combinedLogs).toContain('Guardian UID/email mismatch detected');
    expect(combinedLogs).not.toContain('guardian@example.com');
    expect(combinedLogs).not.toContain('different@example.com');
  });

  it('handles scheduler processing failure and logs only the error message', async () => {
    const fns = require('../../functions/index');
    mockProcessDueEscalations.mockRejectedValueOnce(
      Object.assign(new Error('simulated scheduler failure'), { userId: 'u-sensitive' })
    );

    await fns.processEscalations();

    const combinedLogs = [...logSpy.mock.calls, ...errorSpy.mock.calls]
      .flat()
      .map((entry) => String(entry))
      .join(' ');

    expect(combinedLogs).toContain('[processEscalations] Run failed: simulated scheduler failure');
    expect(combinedLogs).not.toContain('u-sensitive');
  });
});
