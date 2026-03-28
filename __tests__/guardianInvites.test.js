/* global describe, it, expect, jest, beforeEach */

const mockCollection = jest.fn(() => ({ id: 'guardianInvites', path: 'guardianInvites' }));
const mockDoc = jest.fn((...args) => {
  if (args.length === 1 && args[0]?.path === 'guardianInvites') {
    return { id: 'new-invite-123', path: 'guardianInvites/new-invite-123' };
  }
  if (args.length === 3) {
    return { id: args[2], path: `${args[1]}/${args[2]}` };
  }
  return { id: 'mock-doc-id', path: 'guardianInvites/mock-doc-id' };
});
const mockGetDocs = jest.fn();
const mockGetDoc = jest.fn();
const mockSetDoc = jest.fn(() => Promise.resolve());
const mockUpdateDoc = jest.fn(() => Promise.resolve());
const mockDeleteDoc = jest.fn(() => Promise.resolve());
const mockQuery = jest.fn(() => ({}));
const mockWhere = jest.fn(() => ({}));
const mockServerTimestamp = jest.fn(() => new Date());

jest.mock('firebase/firestore', () => ({
  collection: (...args) => mockCollection(...args),
  doc: (...args) => mockDoc(...args),
  getDocs: (...args) => mockGetDocs(...args),
  getDoc: (...args) => mockGetDoc(...args),
  setDoc: (...args) => mockSetDoc(...args),
  updateDoc: (...args) => mockUpdateDoc(...args),
  deleteDoc: (...args) => mockDeleteDoc(...args),
  query: (...args) => mockQuery(...args),
  where: (...args) => mockWhere(...args),
  serverTimestamp: () => mockServerTimestamp(),
  initializeFirestore: jest.fn(() => ({})),
  enableIndexedDbPersistence: jest.fn(() => Promise.resolve()),
  setLogLevel: jest.fn(),
  enableNetwork: jest.fn(() => Promise.resolve()),
}));

jest.mock('../src/config/firebase', () => ({
  db: {},
}));

const { sendGuardianInvite, acceptInvite, rejectInvite } = require('../src/services/guardianInvites');

describe('guardianInvites service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendGuardianInvite', () => {
    it('normalizes and stores invite data', async () => {
      mockGetDocs.mockResolvedValueOnce({ empty: true });

      const inviteId = await sendGuardianInvite({
        userId: 'user-1',
        userEmail: 'USER@MAIL.COM',
        userName: '  Ayesha Khan  ',
        userPhone: '  03001234567  ',
        guardianEmail: 'GUARDIAN@MAIL.COM',
        message: '  Please help keep me safe  ',
      });

      expect(inviteId).toBe('new-invite-123');
      expect(mockSetDoc).toHaveBeenCalledTimes(1);
      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'new-invite-123' }),
        expect.objectContaining({
          userId: 'user-1',
          userEmail: 'user@mail.com',
          userName: 'Ayesha Khan',
          userPhone: '03001234567',
          guardianEmail: 'guardian@mail.com',
          message: 'Please help keep me safe',
          status: 'pending',
        })
      );
    });

    it('rejects duplicate pending invite', async () => {
      mockGetDocs.mockResolvedValueOnce({ empty: false });

      await expect(
        sendGuardianInvite({
          userId: 'user-1',
          userEmail: 'user@mail.com',
          userName: 'Ayesha Khan',
          userPhone: '03001234567',
          guardianEmail: 'guardian@mail.com',
        })
      ).rejects.toMatchObject({ code: 'validation/duplicate-invite' });
    });
  });

  describe('acceptInvite', () => {
    it('marks invite accepted when guardian email matches', async () => {
      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          status: 'pending',
          guardianEmail: 'guardian@mail.com',
        }),
      });

      await acceptInvite('invite-123', 'guardian-uid-1', 'guardian@mail.com');

      expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'invite-123' }),
        expect.objectContaining({
          status: 'accepted',
          acceptedByUid: 'guardian-uid-1',
          acceptedByEmail: 'guardian@mail.com',
        })
      );
      expect(mockSetDoc).not.toHaveBeenCalled();
    });

    it('rejects accept when guardian email does not match invite', async () => {
      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          status: 'pending',
          guardianEmail: 'another@mail.com',
        }),
      });

      await expect(
        acceptInvite('invite-123', 'guardian-uid-1', 'guardian@mail.com')
      ).rejects.toMatchObject({ code: 'validation/email-mismatch' });
      expect(mockUpdateDoc).not.toHaveBeenCalled();
    });
  });

  describe('rejectInvite', () => {
    it('deletes invite when it exists', async () => {
      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
      });

      await rejectInvite('invite-789');

      expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
      expect(mockDeleteDoc).toHaveBeenCalledWith(expect.objectContaining({ id: 'invite-789' }));
    });
  });
});
