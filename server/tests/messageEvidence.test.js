// Edit/delete keep the original text, a deleted message stays reportable for a week, and
// the admin queue shows edit/delete state. No DB: Prisma is mocked.
const express = require('express');
const request = require('supertest');

const mockMessageFindUnique = jest.fn();
const mockMessageFindMany = jest.fn();
const mockFlaggedFindFirst = jest.fn();
const mockFlaggedFindMany = jest.fn();
const mockFlaggedCreate = jest.fn();
const mockUserFindMany = jest.fn();

jest.mock('../lib/prisma', () => ({
  prisma: {
    message: { findUnique: (...a) => mockMessageFindUnique(...a), findMany: (...a) => mockMessageFindMany(...a) },
    flaggedMessage: {
      findFirst: (...a) => mockFlaggedFindFirst(...a),
      findMany: (...a) => mockFlaggedFindMany(...a),
      create: (...a) => mockFlaggedCreate(...a),
    },
    user: { findMany: (...a) => mockUserFindMany(...a) },
  },
}));
jest.mock('../utils/auth', () => ({
  authenticateToken: (req, _res, next) => { req.user = { id: 'reporter', isAdmin: true }; next(); },
  clerkClient: {},
  invalidateClerkUser: jest.fn(),
}));
jest.mock('../utils/chatAuth', () => ({ checkChatPermission: jest.fn().mockResolvedValue(true) }));
jest.mock('../workers/reviewWorker', () => ({ deleteMessageFromChat: jest.fn() }));
jest.mock('../moderationInstance', () => ({ moderator: {} }));

const { applyMessageEdit, applyMessageDelete } = require('../services/messageEvidence');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/messages', require('../routes/messages'));
  app.use('/api/admin', require('../routes/admin'));
  return app;
}

describe('applyMessageEdit / applyMessageDelete', () => {
  // Interactive-transaction fake: `row` is the current DB row; updateMany honours its where.
  function makePrisma(row) {
    const tx = {
      message: {
        findUnique: jest.fn(async () => (row ? { ...row } : null)),
        updateMany: jest.fn(async ({ where, data }) => {
          if (!row || row.isDeleted !== where.isDeleted || row.text !== where.text) return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        }),
      },
      messageEdit: { create: jest.fn(async () => ({})) },
    };
    return { tx, $transaction: jest.fn(async (fn) => fn(tx)) };
  }

  test('edit stores the previous text and applies the new one', async () => {
    const row = { id: 'm1', text: 'original', isDeleted: false };
    const prisma = makePrisma(row);
    expect(await applyMessageEdit(prisma, { id: 'm1' }, 'edited')).toBe('edited');
    expect(prisma.tx.messageEdit.create).toHaveBeenCalledWith({ data: { messageId: 'm1', previousText: 'original' } });
    expect(row).toMatchObject({ text: 'edited', isEdited: true });
  });

  test('edit with identical text is unchanged and writes nothing', async () => {
    const prisma = makePrisma({ id: 'm1', text: 'same', isDeleted: false });
    expect(await applyMessageEdit(prisma, { id: 'm1' }, 'same')).toBe('unchanged');
    expect(prisma.tx.messageEdit.create).not.toHaveBeenCalled();
  });

  test('edit of a message deleted concurrently is a conflict and does not resurrect it', async () => {
    const row = { id: 'm1', text: '', isDeleted: true, deletedText: 'bad words' };
    const prisma = makePrisma(row);
    expect(await applyMessageEdit(prisma, { id: 'm1', text: 'bad words' }, 'new')).toBe('conflict');
    expect(row.text).toBe('');
    expect(prisma.tx.messageEdit.create).not.toHaveBeenCalled();
  });

  test('edit loses the race when the text changed after it was read: conflict, no history row', async () => {
    const row = { id: 'm1', text: 'v1', isDeleted: false };
    const prisma = makePrisma(row);
    prisma.tx.message.findUnique.mockResolvedValueOnce({ ...row });
    prisma.tx.message.updateMany.mockImplementationOnce(async () => ({ count: 0 }));
    expect(await applyMessageEdit(prisma, { id: 'm1' }, 'v2')).toBe('conflict');
    expect(prisma.tx.messageEdit.create).not.toHaveBeenCalled();
  });

  test('delete blanks text but keeps the original in deletedText', async () => {
    const row = { id: 'm1', text: 'bad words', isDeleted: false };
    const prisma = makePrisma(row);
    expect(await applyMessageDelete(prisma, { id: 'm1' })).toBe(true);
    expect(row).toMatchObject({ isDeleted: true, text: '', deletedText: 'bad words' });
    expect(row.deletedAt).toBeInstanceOf(Date);
  });

  test('deleting twice does not overwrite the saved original', async () => {
    const row = { id: 'm1', text: '', isDeleted: true, deletedText: 'bad words' };
    const prisma = makePrisma(row);
    expect(await applyMessageDelete(prisma, { id: 'm1' })).toBe(true);
    expect(row.deletedText).toBe('bad words');
    expect(prisma.tx.message.updateMany).not.toHaveBeenCalled();
  });

  test('delete retries when an edit lands between read and write, and keeps the latest text', async () => {
    const row = { id: 'm1', text: 'v1', isDeleted: false };
    const prisma = makePrisma(row);
    prisma.tx.message.findUnique.mockImplementationOnce(async () => {
      const stale = { ...row };
      row.text = 'v2'; // concurrent edit after the read
      return stale;
    });
    expect(await applyMessageDelete(prisma, { id: 'm1' })).toBe(true);
    expect(row).toMatchObject({ isDeleted: true, deletedText: 'v2' });
  });
});

describe('POST /api/messages/:id/report on deleted messages', () => {
  const base = { id: 'm1', userId: 'sender', chatRoomId: 'room', isDeleted: true };
  beforeEach(() => {
    jest.clearAllMocks();
    mockFlaggedFindFirst.mockResolvedValue(null);
    mockFlaggedCreate.mockResolvedValue({});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  test('recently deleted message is reportable and the queue gets the original text', async () => {
    mockMessageFindUnique.mockResolvedValue({ ...base, text: '', deletedText: 'bad words', deletedAt: new Date() });
    const res = await request(makeApp()).post('/api/messages/m1/report').send({ reason: 'OFFENSIVE' });
    expect(res.statusCode).toBe(201);
    const data = mockFlaggedCreate.mock.calls[0][0].data;
    expect(data.content).toBe('bad words');
    expect(data.aiTriggers).toMatchObject({ messageDeleted: true });
  });

  test('message deleted more than a week ago is no longer reportable', async () => {
    mockMessageFindUnique.mockResolvedValue({ ...base, text: '', deletedText: 'bad words', deletedAt: new Date(Date.now() - 8 * 24 * 3600 * 1000) });
    const res = await request(makeApp()).post('/api/messages/m1/report').send({ reason: 'OFFENSIVE' });
    expect(res.statusCode).toBe(400);
    expect(mockFlaggedCreate).not.toHaveBeenCalled();
  });

  test('legacy deleted message with no saved original is not reportable', async () => {
    mockMessageFindUnique.mockResolvedValue({ ...base, text: '', deletedText: null, deletedAt: null });
    const res = await request(makeApp()).post('/api/messages/m1/report').send({ reason: 'OFFENSIVE' });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/admin/flagged-messages edit/delete state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindMany.mockResolvedValue([]);
  });

  test('exposes edit history and deletion state for the reported message', async () => {
    mockFlaggedFindMany.mockResolvedValue([
      { id: 'f1', messageId: 'm1', userId: 'sender', content: 'edited text', status: 'PENDING_REVIEW', aiTriggers: { reporterId: 'reporter' } },
      { id: 'f2', messageId: 'm2', userId: 'sender', content: 'bad', status: 'PENDING_REVIEW', aiTriggers: {} },
      { id: 'f3', messageId: null, userId: 'sender', content: 'ai flagged', status: 'PENDING_REVIEW', aiTriggers: {} },
    ]);
    const editedAt = new Date('2026-10-20T10:00:00Z');
    mockMessageFindMany.mockResolvedValue([
      { id: 'm1', text: 'edited text', isEdited: true, isDeleted: false, deletedAt: null, deletedText: null, edits: [{ previousText: 'the original', editedAt }] },
      { id: 'm2', text: '', isEdited: false, isDeleted: true, deletedAt: editedAt, deletedText: 'bad', edits: [] },
    ]);
    const res = await request(makeApp()).get('/api/admin/flagged-messages');
    expect(res.statusCode).toBe(200);
    const byId = Object.fromEntries(res.body.map((r) => [r.id, r]));
    expect(byId.f1.messageState).toMatchObject({ isEdited: true, currentText: 'edited text', originalText: 'the original' });
    expect(byId.f1.messageState.edits).toHaveLength(1);
    expect(byId.f2.messageState).toMatchObject({ isDeleted: true, currentText: null, originalText: 'bad' });
    expect(byId.f3.messageState).toBeNull();
  });
});
