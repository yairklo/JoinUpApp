const request = require('supertest');

jest.setTimeout(30000);

const mockDeleteUser = jest.fn().mockResolvedValue({});

jest.mock('../utils/auth', () => ({
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const users = {
      mock_token_a: { id: 'blk_user_a', name: 'A' },
      mock_token_b: { id: 'blk_user_b', name: 'B' },
      mock_token_c: { id: 'blk_user_c', name: 'C' },
    };
    if (!users[token]) return res.status(403).json({ error: 'Invalid token' });
    req.user = users[token];
    return next();
  },
  attachOptionalUser: (_req, _res, next) => next(),
  invalidateClerkUser: jest.fn(),
  clerkClient: { users: { deleteUser: (...args) => mockDeleteUser(...args) } },
}));

jest.mock('../workers/reviewWorker', () => ({
  processReviewQueue: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../workers/cleanupWorker', () => ({
  startCleanupWorker: jest.fn(),
}));

const { prisma } = require('../services/gameService');
const { app } = require('../index');

const ids = ['blk_user_a', 'blk_user_b', 'blk_user_c'];
const roomId = `test_block_room_${Date.now()}`;
let msgB;

describe('user block + account deletion', () => {
  beforeAll(async () => {
    await prisma.$connect();
    for (const id of ids) {
      await prisma.user.upsert({
        where: { id },
        update: { deletedAt: null, name: id },
        create: { id, name: id },
      });
    }
    await prisma.chatRoom.create({
      data: {
        id: roomId,
        type: 'GROUP',
        participants: { create: ids.map((userId) => ({ userId })) },
      },
    });
    msgB = await prisma.message.create({ data: { chatRoomId: roomId, text: 'from B', userId: 'blk_user_b' } });
    await prisma.message.create({ data: { chatRoomId: roomId, text: 'from C', userId: 'blk_user_c' } });
  });

  afterAll(async () => {
    try {
      await prisma.userBlock.deleteMany({ where: { OR: [{ blockerId: { in: ids } }, { blockedId: { in: ids } }] } });
      await prisma.message.deleteMany({ where: { chatRoomId: roomId } });
      await prisma.chatParticipant.deleteMany({ where: { chatId: roomId } });
      await prisma.chatRoom.deleteMany({ where: { id: roomId } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    } catch (err) {
      console.warn('userBlockAndDelete cleanup skipped:', err.message);
    }
  });

  test('block requires auth and rejects self-block', async () => {
    expect((await request(app).post('/api/users/blk_user_b/block')).statusCode).toEqual(401);
    const self = await request(app).post('/api/users/blk_user_a/block').set('Authorization', 'Bearer mock_token_a');
    expect(self.statusCode).toEqual(400);
  });

  test('blocking hides the blocked user\'s messages for the blocker only', async () => {
    const block = await request(app).post('/api/users/blk_user_b/block').set('Authorization', 'Bearer mock_token_a');
    expect(block.statusCode).toEqual(201);

    const again = await request(app).post('/api/users/blk_user_b/block').set('Authorization', 'Bearer mock_token_a');
    expect(again.statusCode).toEqual(201);

    const asA = await request(app).get(`/api/messages?roomId=${roomId}`).set('Authorization', 'Bearer mock_token_a');
    expect(asA.statusCode).toEqual(200);
    expect(asA.body.map((m) => m.text).sort()).toEqual(['from C']);

    const asC = await request(app).get(`/api/messages?roomId=${roomId}`).set('Authorization', 'Bearer mock_token_c');
    expect(asC.body.map((m) => m.text).sort()).toEqual(['from B', 'from C']);
  });

  test('blocked pair cannot open a private chat in either direction', async () => {
    const fromA = await request(app).post('/api/chats/private').set('Authorization', 'Bearer mock_token_a').send({ targetUserId: 'blk_user_b' });
    expect(fromA.statusCode).toEqual(403);
    const fromB = await request(app).post('/api/chats/private').set('Authorization', 'Bearer mock_token_b').send({ targetUserId: 'blk_user_a' });
    expect(fromB.statusCode).toEqual(403);
    expect(fromB.body.code).toEqual('USER_BLOCKED');
  });

  test('list and unblock', async () => {
    const list = await request(app).get('/api/users/blocks').set('Authorization', 'Bearer mock_token_a');
    expect(list.statusCode).toEqual(200);
    expect(list.body.map((b) => b.id)).toEqual(['blk_user_b']);

    const del = await request(app).delete('/api/users/blk_user_b/block').set('Authorization', 'Bearer mock_token_a');
    expect(del.statusCode).toEqual(200);
    const after = await request(app).get('/api/users/blocks').set('Authorization', 'Bearer mock_token_a');
    expect(after.body).toEqual([]);
  });

  test('DELETE /api/users/me anonymises the row, scrubs messages and deletes the Clerk user', async () => {
    const unauth = await request(app).delete('/api/users/me');
    expect(unauth.statusCode).toEqual(401);

    const res = await request(app).delete('/api/users/me').set('Authorization', 'Bearer mock_token_b');
    expect(res.statusCode).toEqual(200);
    expect(mockDeleteUser).toHaveBeenCalledWith('blk_user_b');

    const row = await prisma.user.findUnique({ where: { id: 'blk_user_b' } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.email).toBeNull();
    expect(row.imageUrl).toBeNull();

    const msg = await prisma.message.findUnique({ where: { id: msgB.id } });
    expect(msg.text).toEqual('');
    expect(msg.isDeleted).toBe(true);

    const part = await prisma.chatParticipant.findFirst({ where: { chatId: roomId, userId: 'blk_user_b' } });
    expect(part).toBeNull();
  });
});
