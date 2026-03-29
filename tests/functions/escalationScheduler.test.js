/* global describe, it, expect */

const { processDueEscalations } = require('../../functions/escalationService');

describe('Cloud Function scheduler escalation logic', () => {
  let logSpy;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('returns empty summary when no due alerts exist', async () => {
    const db = {
      collection: () => ({
        where: () => ({
          where: () => ({
            where: () => ({
              limit: () => ({
                get: async () => ({ empty: true }),
              }),
            }),
          }),
        }),
      }),
    };

    const summary = await processDueEscalations(db, jest.fn());
    expect(summary).toEqual({ processed: 0, escalated: 0 });
  });

  it('escalates a due active alert and pushes to authorities', async () => {
    const alerts = {
      alertX: {
        userId: 'u-x',
        status: 'active',
        escalationState: 'pending',
        escalationDueAt: new Date(Date.now() - 5000),
        latitude: 31.2,
        longitude: 74.1,
      },
    };

    const db = {
      collection: (name) => {
        if (name === 'alerts') {
          const q = {
            where: () => q,
            limit: () => q,
            get: async () => ({ empty: false, size: 1, docs: [{ id: 'alertX' }] }),
          };

          return {
            where: () => q,
            doc: (id) => ({
              get: async () => ({ exists: !!alerts[id], data: () => alerts[id] }),
              update: async (payload) => {
                alerts[id] = { ...alerts[id], ...payload };
              },
              set: async (payload) => {
                alerts[id] = { ...alerts[id], ...payload };
              },
            }),
          };
        }

        if (name === 'users') {
          return {
            doc: () => ({
              get: async () => ({ exists: true, data: () => ({ fullName: 'Nadia', phone: '+923001112233' }) }),
            }),
          };
        }

        if (name === 'policeAlerts') {
          return {
            doc: () => ({ create: async () => {} }),
          };
        }

        if (name === 'authorities') {
          return {
            get: async () => ({
              empty: false,
              forEach: (cb) => cb({ data: () => ({ fcmToken: 'ExponentPushToken[auth-1]' }) }),
            }),
          };
        }

        return {
          doc: () => ({ get: async () => ({ exists: false, data: () => ({}) }) }),
        };
      },
    };

    const sendPush = jest.fn(async () => ({}));
    const summary = await processDueEscalations(db, sendPush);

    expect(summary.processed).toBe(1);
    expect(summary.escalated).toBe(1);
    expect(alerts.alertX.escalationState).toBe('completed');
    expect(sendPush).toHaveBeenCalledTimes(1);

    const combinedLogs = logSpy.mock.calls
      .flat()
      .map((entry) => String(entry))
      .join(' ');

    expect(combinedLogs).toContain('"userId":"[redacted]"');
    expect(combinedLogs).not.toContain('"userId":"u-x"');
  });
});
