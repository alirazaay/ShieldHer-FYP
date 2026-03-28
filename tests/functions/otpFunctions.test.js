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

jest.mock('axios', () => ({ post: jest.fn(async () => ({ data: { data: [] } })) }), { virtual: true });

jest.mock('../../functions/escalationService', () => ({
  enqueueEscalation: jest.fn(async () => {}),
  processDueEscalations: jest.fn(async () => ({ processed: 0, escalated: 0 })),
}));

jest.mock('firebase-admin/app', () => ({ initializeApp: jest.fn() }), { virtual: true });

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => ({
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: false, data: () => ({}) }),
        set: async () => {},
        delete: async () => {},
      }),
    }),
  })),
  FieldValue: {
    serverTimestamp: jest.fn(() => new Date()),
  },
}), { virtual: true });

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => ({
    getUserByPhoneNumber: jest.fn(async () => {
      throw Object.assign(new Error('not found'), { code: 'auth/user-not-found' });
    }),
    createUser: jest.fn(async () => ({ uid: 'uid-new' })),
    createCustomToken: jest.fn(async () => 'custom-token'),
  })),
}), { virtual: true });

function createResponse() {
  const res = {
    statusCode: 200,
    body: null,
  };

  res.status = jest.fn((code) => {
    res.statusCode = code;
    return {
      json: jest.fn((payload) => {
        res.body = payload;
        return payload;
      }),
    };
  });

  return res;
}

describe('Cloud Functions OTP handlers', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('rejects invalid phone in sendOTP', async () => {
    const fns = require('../../functions/index');
    const req = { method: 'POST', body: { phoneNumber: 'abc' } };
    const res = createResponse();

    await fns.sendOTP(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('validation/invalid-phone');
  });

  it('rejects invalid OTP payload in verifyOTP', async () => {
    const fns = require('../../functions/index');
    const req = { method: 'POST', body: { phoneNumber: '+923001112233', code: '12' } };
    const res = createResponse();

    await fns.verifyOTP(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('validation/invalid-input');
  });
});
