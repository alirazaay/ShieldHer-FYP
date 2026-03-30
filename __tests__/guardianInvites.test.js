/* global describe, it, expect, jest, beforeEach */

const mockCollection = jest.fn(() => ({ id: 'guardianInvites', path: 'guardianInvites' }));
const mockDoc = jest.fn((...args) => {
  if (args.length === 1 && args[0]?.path === 'guardianInvites') {
    return { id: 'new-invite-123', path: 'guardianInvites/new-invite-123' };
  }
  if (args.length >= 3) {
    const segments = args.slice(1);
    return {
      id: segments[segments.length - 1],
      path: segments.join('/'),
    };
  }
  return { id: 'mock-doc-id', path: 'guardianInvites/mock-doc-id' };
});
const mockGetDocs = jest.fn();
const mockGetDoc = jest.fn();
const mockSetDoc = jest.fn(() => Promise.resolve());
const mockDeleteDoc = jest.fn(() => Promise.resolve());
const mockBatchSet = jest.fn();
const mockBatchDelete = jest.fn();
const mockBatchCommit = jest.fn(() => Promise.resolve());
const mockWriteBatch = jest.fn(() => ({
  set: mockBatchSet,
  delete: mockBatchDelete,
  commit: mockBatchCommit,
}));
const mockQuery = jest.fn(() => ({}));
const mockWhere = jest.fn(() => ({}));
const mockServerTimestamp = jest.fn(() => new Date());

jest.mock('firebase/firestore', () => ({
  collection: (...args) => mockCollection(...args),
  doc: (...args) => mockDoc(...args),
  getDocs: (...args) => mockGetDocs(...args),
  getDoc: (...args) => mockGetDoc(...args),
  setDoc: (...args) => mockSetDoc(...args),
  deleteDoc: (...args) => mockDeleteDoc(...args),
  writeBatch: (...args) => mockWriteBatch(...args),
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
    it('creates bidirectional links and deletes invite when guardian email matches', async () => {
      mockGetDoc
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => ({
            status: 'pending',
            guardianEmail: 'guardian@mail.com',
            userId: 'user-1',
            userName: 'Ayesha Khan',
            userEmail: 'user@mail.com',
            userPhone: '03001234567',
          }),
        })
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => ({
            fullName: 'Guardian Person',
            phone: '03110001111',
            relationship: 'Sibling',
          }),
        });

      await acceptInvite('invite-123', 'guardian-uid-1', 'guardian@mail.com');

      expect(mockWriteBatch).toHaveBeenCalledTimes(1);
      expect(mockBatchSet).toHaveBeenCalledTimes(2);
      expect(mockBatchDelete).toHaveBeenCalledTimes(1);
      expect(mockBatchCommit).toHaveBeenCalledTimes(1);
      expect(mockBatchSet).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ id: 'guardian-uid-1', path: 'users/user-1/guardians/guardian-uid-1' }),
        expect.objectContaining({
          status: 'active',
          email: 'guardian@mail.com',
          inviteId: 'invite-123',
          isRegisteredUser: true,
        }),
        { merge: true }
      );
      expect(mockBatchSet).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ id: 'user-1', path: 'users/guardian-uid-1/connectedUsers/user-1' }),
        expect.objectContaining({
          status: 'active',
          email: 'user@mail.com',
          inviteId: 'invite-123',
        }),
        { merge: true }
      );
      expect(mockBatchDelete).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'invite-123', path: 'guardianInvites/invite-123' })
      );
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
      expect(mockBatchCommit).not.toHaveBeenCalled();
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
