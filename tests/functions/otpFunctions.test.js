/* global describe, it, expect, beforeEach, jest */

global.__DEV__ = true;

const otpStore = {};

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
    collection: (name) => {
      if (name !== 'otpCodes') {
        return {
          doc: () => ({
            get: async () => ({ exists: false, data: () => ({}) }),
            set: async () => {},
            delete: async () => {},
          }),
        };
      }

      return {
        doc: (id) => ({
          get: async () => {
            const existing = otpStore[id];
            return {
              exists: !!existing,
              data: () => existing || {},
            };
          },
          set: async (payload) => {
            otpStore[id] = {
              ...(otpStore[id] || {}),
              ...payload,
            };
          },
          update: async (payload) => {
            const current = otpStore[id] || {};
            const next = { ...current };
            Object.keys(payload || {}).forEach((key) => {
              const value = payload[key];
              if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, '__incrementBy')) {
                next[key] = Number(next[key] || 0) + Number(value.__incrementBy);
              } else {
                next[key] = value;
              }
            });
            otpStore[id] = next;
          },
          delete: async () => {
            delete otpStore[id];
          },
        }),
      };
    },
  })),
  FieldValue: {
    serverTimestamp: jest.fn(() => new Date()),
    increment: jest.fn((n) => ({ __incrementBy: n })),
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
  let logSpy;
  let errorSpy;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    Object.keys(otpStore).forEach((key) => delete otpStore[key]);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
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

  it('sends OTP successfully and does not log full phone number', async () => {
    const crypto = require('crypto');
    jest.spyOn(crypto, 'randomInt').mockReturnValue(123456);

    const fns = require('../../functions/index');
    const req = { method: 'POST', body: { phoneNumber: '+923001112233' } };
    const res = createResponse();

    await fns.sendOTP(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    const combinedLogs = [...logSpy.mock.calls, ...errorSpy.mock.calls]
      .flat()
      .map((entry) => String(entry))
      .join(' ');

    expect(combinedLogs).toContain('Twilio not configured');
    expect(combinedLogs).toContain('***');
    expect(combinedLogs).not.toContain('+923001112233');
  });

  it('verifies OTP successfully and does not log raw UID in verify messages', async () => {
    const crypto = require('crypto');
    jest.spyOn(crypto, 'randomInt').mockReturnValue(222333);

    const fns = require('../../functions/index');

    const sendReq = { method: 'POST', body: { phoneNumber: '+923001112233' } };
    const sendRes = createResponse();
    await fns.sendOTP(sendReq, sendRes);
    expect(sendRes.statusCode).toBe(200);

    const verifyReq = {
      method: 'POST',
      body: { phoneNumber: '+923001112233', code: '222333' },
    };
    const verifyRes = createResponse();

    await fns.verifyOTP(verifyReq, verifyRes);

    expect(verifyRes.statusCode).toBe(200);
    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.isNewUser).toBe(true);

    const combinedLogs = [...logSpy.mock.calls, ...errorSpy.mock.calls]
      .flat()
      .map((entry) => String(entry))
      .join(' ');

    expect(combinedLogs).toContain('[verifyOTP] New user created');
    expect(combinedLogs).not.toContain('uid-new');
  });
});
