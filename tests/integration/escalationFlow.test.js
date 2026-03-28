/* global describe, it, expect */

const { processDueEscalations } = require('../../functions/escalationService');

function buildEscalationDb() {
  const alerts = {
    'alert-esc-1': {
      userId: 'user-200',
      status: 'active',
      escalationState: 'pending',
      escalationDueAt: new Date(Date.now() - 60000),
      latitude: 33.7,
      longitude: 73.1,
      accuracy: 9,
      timestamp: new Date(Date.now() - 120000),
      createdAt: new Date(Date.now() - 120000),
    },
  };

  const policeAlerts = {};

  return {
    __alerts: alerts,
    __policeAlerts: policeAlerts,
    collection: (name) => {
      if (name === 'alerts') {
        const queryChain = {
          where: () => queryChain,
          limit: () => queryChain,
          get: async () => ({
            empty: false,
            size: 1,
            docs: [{ id: 'alert-esc-1' }],
          }),
        };

        return {
          where: () => queryChain,
          doc: (id) => ({
            get: async () => ({
              exists: Boolean(alerts[id]),
              data: () => alerts[id],
            }),
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
          doc: (id) => ({
            get: async () => ({
              exists: true,
              data: () => ({ fullName: `User ${id}`, phone: '+923001234567' }),
            }),
          }),
        };
      }

      if (name === 'policeAlerts') {
        return {
          doc: (id) => ({
            create: async (payload) => {
              policeAlerts[id] = payload;
            },
          }),
        };
      }

      if (name === 'authorities') {
        return {
          get: async () => ({
            empty: false,
            forEach: (cb) => {
              cb({ data: () => ({ fcmToken: 'ExponentPushToken[authority-1]' }) });
            },
          }),
        };
      }

      return {
        doc: () => ({
          get: async () => ({ exists: false, data: () => ({}) }),
        }),
      };
    },
  };
}

describe('escalation flow integration', () => {
  it('escalates pending active alert when no guardian responds', async () => {
    const db = buildEscalationDb();
    const sendPush = jest.fn(async () => ({ data: [{ status: 'ok' }] }));

    const result = await processDueEscalations(db, sendPush);

    expect(result.processed).toBe(1);
    expect(result.escalated).toBe(1);
    expect(db.__alerts['alert-esc-1'].escalated).toBe(true);
    expect(db.__alerts['alert-esc-1'].escalationState).toBe('completed');
    expect(db.__policeAlerts['alert-esc-1']).toBeTruthy();
    expect(sendPush).toHaveBeenCalledTimes(1);
  });
});
