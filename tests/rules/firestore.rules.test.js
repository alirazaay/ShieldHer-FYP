/* global describe, it, expect, beforeAll, afterAll, beforeEach */

const fs = require('fs');
const path = require('path');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, updateDoc } = require('firebase/firestore');

const PROJECT_ID = 'demo-shieldher';

let testEnv;
let isFirestoreEmulatorAvailable = true;

async function seedData(seedFn) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await seedFn(context.firestore());
  });
}

describe('Firestore security rules', () => {
  beforeAll(async () => {
    try {
      testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: {
          rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8'),
        },
      });
    } catch (error) {
      const message = String(error?.message || error);
      if (message.includes('host and port of the firestore emulator must be specified')) {
        isFirestoreEmulatorAvailable = false;
        console.warn(
          '[firestore.rules.test] Firestore emulator not detected. Skipping rules tests. Run: npm run test:rules:emulator'
        );
        return;
      }
      throw error;
    }
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    if (!isFirestoreEmulatorAvailable) return;
    await testEnv.clearFirestore();
  });

  it('allows user to create their own alert', async () => {
    if (!isFirestoreEmulatorAvailable) return;
    const userDb = testEnv.authenticatedContext('user-1').firestore();

    await assertSucceeds(
      setDoc(doc(userDb, 'alerts', 'alert-1'), {
        ownerId: 'user-1',
        userId: 'user-1',
        alertId: 'alert-1',
        createdAt: new Date(),
        timestamp: new Date(),
        status: 'active',
        alertType: 'SOS',
        location: { latitude: 33.6844, longitude: 73.0479 },
        latitude: 33.6844,
        longitude: 73.0479,
        accuracy: 10,
      })
    );
  });

  it('allows guardians to read linked user alerts', async () => {
    if (!isFirestoreEmulatorAvailable) return;
    await seedData(async (db) => {
      await setDoc(doc(db, 'users', 'user-2', 'guardians', 'guardian-2'), {
        status: 'active',
      });
      await setDoc(doc(db, 'alerts', 'alert-2'), {
        ownerId: 'user-2',
        userId: 'user-2',
        alertId: 'alert-2',
        createdAt: new Date(),
        timestamp: new Date(),
        status: 'active',
        alertType: 'SOS',
        location: { latitude: 31.5, longitude: 74.3 },
        latitude: 31.5,
        longitude: 74.3,
        accuracy: 11,
      });
    });

    const guardianDb = testEnv.authenticatedContext('guardian-2').firestore();
    await assertSucceeds(getDoc(doc(guardianDb, 'alerts', 'alert-2')));
  });

  it('prevents guardians from changing restricted immutable fields', async () => {
    if (!isFirestoreEmulatorAvailable) return;
    await seedData(async (db) => {
      await setDoc(doc(db, 'users', 'user-3', 'guardians', 'guardian-3'), {
        status: 'active',
      });
      await setDoc(doc(db, 'alerts', 'alert-3'), {
        ownerId: 'user-3',
        userId: 'user-3',
        alertId: 'alert-3',
        createdAt: new Date(),
        timestamp: new Date(),
        status: 'active',
        alertType: 'SOS',
        location: { latitude: 30.0, longitude: 70.0 },
        latitude: 30.0,
        longitude: 70.0,
        accuracy: 12,
      });
    });

    const guardianDb = testEnv.authenticatedContext('guardian-3').firestore();

    await assertFails(
      updateDoc(doc(guardianDb, 'alerts', 'alert-3'), {
        latitude: 99.9999,
      })
    );
  });

  it('blocks non-authenticated users from reading alerts', async () => {
    if (!isFirestoreEmulatorAvailable) return;
    await seedData(async (db) => {
      await setDoc(doc(db, 'alerts', 'alert-4'), {
        ownerId: 'user-4',
        userId: 'user-4',
        alertId: 'alert-4',
        createdAt: new Date(),
        timestamp: new Date(),
        status: 'active',
        alertType: 'SOS',
        location: { latitude: 35.0, longitude: 75.0 },
        latitude: 35.0,
        longitude: 75.0,
        accuracy: 8,
      });
    });

    const unauthDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(unauthDb, 'alerts', 'alert-4')));
  });

  it('allows police users to read escalated alerts', async () => {
    if (!isFirestoreEmulatorAvailable) return;
    await seedData(async (db) => {
      await setDoc(doc(db, 'users', 'police-1'), {
        role: 'police',
      });
      await setDoc(doc(db, 'alerts', 'alert-5'), {
        ownerId: 'user-5',
        userId: 'user-5',
        alertId: 'alert-5',
        createdAt: new Date(),
        timestamp: new Date(),
        status: 'active',
        escalationState: 'completed',
        escalated: true,
        alertType: 'SOS',
        location: { latitude: 32.0, longitude: 72.0 },
        latitude: 32.0,
        longitude: 72.0,
        accuracy: 14,
      });
    });

    const policeDb = testEnv.authenticatedContext('police-1', { role: 'police' }).firestore();
    await assertSucceeds(getDoc(doc(policeDb, 'alerts', 'alert-5')));
  });
});
