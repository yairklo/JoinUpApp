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
      await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
      await prisma.friendRequest.deleteMany({
        where: { OR: [{ requesterId: { in: ids } }, { receiverId: { in: ids } }] },
      });
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

  test('blocked pair cannot open a private chat, and the response matches friends-only', async () => {
    await prisma.user.update({ where: { id: 'blk_user_c' }, data: { privacyMessages: 'FRIENDS_ONLY' } });
    let friendsOnly;
    let fromA;
    let fromB;
    try {
      friendsOnly = await request(app).post('/api/chats/private').set('Authorization', 'Bearer mock_token_a').send({ targetUserId: 'blk_user_c' });
      fromA = await request(app).post('/api/chats/private').set('Authorization', 'Bearer mock_token_a').send({ targetUserId: 'blk_user_b' });
      fromB = await request(app).post('/api/chats/private').set('Authorization', 'Bearer mock_token_b').send({ targetUserId: 'blk_user_a' });
    } finally {
      await prisma.user.update({ where: { id: 'blk_user_c' }, data: { privacyMessages: null } });
    }

    expect(friendsOnly.statusCode).toEqual(403);
    expect(fromA.statusCode).toEqual(403);
    expect(fromB.statusCode).toEqual(403);
    expect(fromA.body).toEqual(friendsOnly.body);
    expect(fromB.body).toEqual(friendsOnly.body);
    expect(fromB.body.code).toBeUndefined();
    expect(JSON.stringify(fromB.body).toLowerCase()).not.toMatch(/block/);

    const privateRooms = await prisma.chatRoom.findMany({
      where: {
        type: 'PRIVATE',
        participants: { some: { userId: 'blk_user_a' } },
      },
    });
    expect(privateRooms).toHaveLength(0);
  });

  test('a blocked friend request looks like a normal send and stores nothing', async () => {
    await prisma.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId: 'blk_user_a', blockedId: 'blk_user_b' } },
      update: {},
      create: { blockerId: 'blk_user_a', blockedId: 'blk_user_b' },
    });

    const real = await request(app).post('/api/users/requests').set('Authorization', 'Bearer mock_token_a').send({ receiverId: 'blk_user_c' });
    expect(real.statusCode).toEqual(201);

    const fromBlocked = await request(app).post('/api/users/requests').set('Authorization', 'Bearer mock_token_b').send({ receiverId: 'blk_user_a' });
    const fromBlocker = await request(app).post('/api/users/requests').set('Authorization', 'Bearer mock_token_a').send({ receiverId: 'blk_user_b' });

    for (const res of [fromBlocked, fromBlocker]) {
      expect(res.statusCode).toEqual(201);
      expect(Object.keys(res.body).sort()).toEqual(Object.keys(real.body).sort());
      expect(res.body.status).toEqual('PENDING');
      expect(res.body.code).toBeUndefined();
      expect(JSON.stringify(res.body).toLowerCase()).not.toMatch(/block/);
    }
    expect(fromBlocked.body.requesterId).toEqual('blk_user_b');
    expect(fromBlocked.body.receiverId).toEqual('blk_user_a');
    expect(fromBlocker.body.requesterId).toEqual('blk_user_a');
    expect(fromBlocker.body.receiverId).toEqual('blk_user_b');

    const stored = await prisma.friendRequest.findMany({
      where: { OR: [{ requesterId: 'blk_user_b', receiverId: 'blk_user_a' }, { requesterId: 'blk_user_a', receiverId: 'blk_user_b' }] },
    });
    expect(stored).toHaveLength(0);
    const notes = await prisma.notification.findMany({
      where: { userId: { in: ['blk_user_a', 'blk_user_b'] }, type: 'FRIEND_REQUEST' },
    });
    expect(notes).toHaveLength(0);

    const outgoing = await request(app).get('/api/users/blk_user_b/requests/outgoing').set('Authorization', 'Bearer mock_token_b');
    expect(outgoing.statusCode).toEqual(200);
    expect(outgoing.body).toEqual([]);

    await prisma.friendRequest.deleteMany({ where: { OR: [{ requesterId: 'blk_user_a' }, { receiverId: 'blk_user_a' }] } });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  });

  test('a private-chat send does not reveal a block, and nothing is stored', async () => {
    const fs = require('fs');
    const path = require('path');
    const indexSrc = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    const messagesSrc = fs.readFileSync(path.join(__dirname, '../routes/messages.js'), 'utf8');
    expect(indexSrc).not.toMatch(/USER_BLOCKED|cannot message this user/i);
    expect(messagesSrc).not.toMatch(/USER_BLOCKED|cannot message this user/i);

    const privateRoomId = `test_dm_pair_${Date.now()}`;
    const openRoomId = `test_dm_open_${Date.now()}`;
    const hiddenText = 'ping from the other side';
    const blockerText = 'ping the other way';
    const mutualText = 'ping after both sides';
    await prisma.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId: 'blk_user_a', blockedId: 'blk_user_b' } },
      update: {},
      create: { blockerId: 'blk_user_a', blockedId: 'blk_user_b' },
    });
    await prisma.chatRoom.create({
      data: {
        id: privateRoomId,
        type: 'PRIVATE',
        participants: { create: [{ userId: 'blk_user_a' }, { userId: 'blk_user_b' }] },
      },
    });
    await prisma.chatRoom.create({
      data: {
        id: openRoomId,
        type: 'PRIVATE',
        participants: { create: [{ userId: 'blk_user_a' }, { userId: 'blk_user_c' }] },
      },
    });

    try {
      const real = await request(app)
        .post('/api/messages')
        .set('Authorization', 'Bearer mock_token_a')
        .send({ roomId: openRoomId, text: 'hello there' });
      expect(real.statusCode).toEqual(201);
      expect(real.body.status).toEqual('sent');
      expect(real.body.code).toBeUndefined();

      // B is the blocked party: the send looks like the real one and is not stored.
      const fromBlocked = await request(app)
        .post('/api/messages')
        .set('Authorization', 'Bearer mock_token_b')
        .send({ roomId: privateRoomId, text: hiddenText });
      expect(fromBlocked.statusCode).toEqual(201);
      expect(Object.keys(fromBlocked.body).sort()).toEqual(Object.keys(real.body).sort());
      expect(fromBlocked.body.status).toEqual('sent');
      expect(fromBlocked.body.userId).toEqual('blk_user_b');
      expect(fromBlocked.body.roomId).toEqual(privateRoomId);
      expect(fromBlocked.body.text).toEqual(hiddenText);
      expect(fromBlocked.body.code).toBeUndefined();
      expect(fromBlocked.body.id).toMatch(/^c[a-z0-9]{24}$/);
      expect(JSON.stringify(fromBlocked.body).toLowerCase()).not.toMatch(/block/);
      expect(await prisma.message.findUnique({ where: { id: fromBlocked.body.id } })).toBeNull();

      // A is the blocker: a generic failure, same body as a create that did not complete.
      const fromBlocker = await request(app)
        .post('/api/messages')
        .set('Authorization', 'Bearer mock_token_a')
        .send({ roomId: privateRoomId, text: blockerText });
      expect(fromBlocker.statusCode).toEqual(500);
      expect(fromBlocker.body).toEqual({ error: 'Failed to create message' });
      expect(fromBlocker.body.code).toBeUndefined();
      expect(JSON.stringify(fromBlocker.body).toLowerCase()).not.toMatch(/block/);

      // Mutual: A is now also the blocked party, so their send is acked and still not stored.
      await prisma.userBlock.create({ data: { blockerId: 'blk_user_b', blockedId: 'blk_user_a' } });
      const fromMutual = await request(app)
        .post('/api/messages')
        .set('Authorization', 'Bearer mock_token_a')
        .send({ roomId: privateRoomId, text: mutualText });
      expect(fromMutual.statusCode).toEqual(201);
      expect(Object.keys(fromMutual.body).sort()).toEqual(Object.keys(real.body).sort());
      expect(fromMutual.body.status).toEqual('sent');
      expect(JSON.stringify(fromMutual.body).toLowerCase()).not.toMatch(/block/);

      const stored = await prisma.message.findMany({ where: { chatRoomId: privateRoomId } });
      expect(stored).toHaveLength(0);
      const asA = await request(app).get(`/api/messages?roomId=${privateRoomId}`).set('Authorization', 'Bearer mock_token_a');
      const asB = await request(app).get(`/api/messages?roomId=${privateRoomId}`).set('Authorization', 'Bearer mock_token_b');
      expect(asA.body).toEqual([]);
      expect(asB.body).toEqual([]);
      const notes = await prisma.notification.findMany({
        where: { userId: { in: ['blk_user_a', 'blk_user_b'] }, type: 'NEW_MESSAGE' },
      });
      expect(notes).toHaveLength(0);

      // A group chat is not closed by a block. B can still post there.
      const group = await request(app)
        .post('/api/messages')
        .set('Authorization', 'Bearer mock_token_b')
        .send({ roomId, text: 'still in the group' });
      expect(group.statusCode).toEqual(201);
      expect(await prisma.message.findUnique({ where: { id: group.body.id } })).not.toBeNull();
      await prisma.message.delete({ where: { id: group.body.id } });
    } finally {
      await prisma.userBlock.deleteMany({
        where: { blockerId: 'blk_user_b', blockedId: 'blk_user_a' },
      });
      await prisma.message.deleteMany({ where: { chatRoomId: { in: [privateRoomId, openRoomId] } } });
      await prisma.chatParticipant.deleteMany({ where: { chatId: { in: [privateRoomId, openRoomId] } } });
      await prisma.chatRoom.deleteMany({ where: { id: { in: [privateRoomId, openRoomId] } } });
    }
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
