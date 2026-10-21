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
const { app, io } = require('../index');

// Drive the socket handlers without a Clerk handshake: the connection listener registers
// them on the socket we pass in. `io.to().emit` goes through the adapter, which this records.
function installBroadcastCapture(serverIo) {
  const events = [];
  const adapter = serverIo.of('/').adapter;
  const original = adapter.broadcast.bind(adapter);
  adapter.broadcast = (packet, opts) => {
    const data = packet && packet.data;
    if (Array.isArray(data) && data.length) {
      events.push({
        event: data[0],
        payload: data[1],
        rooms: opts && opts.rooms ? [...opts.rooms].map(String) : [],
      });
    }
    return original(packet, opts);
  };
  return {
    events,
    restore() { adapter.broadcast = original; },
  };
}

async function connectSocket(serverIo, userId) {
  const local = [];
  const handlers = {};
  const socket = {
    id: `sock_${userId}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    data: {},
    rooms: new Set(),
    handshake: {},
    join(room) { this.rooms.add(String(room)); },
    leave(room) { this.rooms.delete(String(room)); },
    emit(event, payload) { local.push({ event, payload }); },
    to(room) {
      const target = String(room);
      return {
        emit: (event, payload) => {
          local.push({ event, payload, room: target, broadcast: true });
        },
      };
    },
    on(event, fn) { handlers[event] = fn; },
  };
  const [onConnection] = serverIo.listeners('connection');
  if (!onConnection) throw new Error('socket connection listener missing');
  await onConnection(socket);
  if (!handlers.typing || !handlers.addReaction || !handlers.editMessage || !handlers.markAsRead) {
    throw new Error('socket handlers were not registered');
  }
  return { handlers, local };
}

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

  describe('socket events in a private chat with a block', () => {
    const privateRoomId = `test_dm_socket_${Date.now()}`;
    let msgFromA;
    let msgFromB;
    let groupFromA;
    let groupFromB;
    let capture;
    let actorA;
    let actorB;

    const named = (events, event) => events.filter((e) => e.event === event);

    beforeAll(async () => {
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
      msgFromA = await prisma.message.create({
        data: { chatRoomId: privateRoomId, text: 'private from A', userId: 'blk_user_a', status: 'sent' },
      });
      msgFromB = await prisma.message.create({
        data: { chatRoomId: privateRoomId, text: 'private from B', userId: 'blk_user_b', status: 'sent' },
      });
      groupFromA = await prisma.message.create({
        data: { chatRoomId: roomId, text: 'group from A', userId: 'blk_user_a', status: 'sent' },
      });
      groupFromB = await prisma.message.create({
        data: { chatRoomId: roomId, text: 'group from B', userId: 'blk_user_b', status: 'sent' },
      });
      capture = installBroadcastCapture(io);
      actorA = await connectSocket(io, 'blk_user_a');
      actorB = await connectSocket(io, 'blk_user_b');
    });

    afterAll(async () => {
      if (capture) capture.restore();
      await prisma.userBlock.deleteMany({ where: { blockerId: 'blk_user_b', blockedId: 'blk_user_a' } });
      await prisma.reaction.deleteMany({ where: { messageId: { in: [groupFromA?.id, groupFromB?.id].filter(Boolean) } } });
      await prisma.message.deleteMany({ where: { id: { in: [groupFromA?.id, groupFromB?.id].filter(Boolean) } } });
      await prisma.message.deleteMany({ where: { chatRoomId: privateRoomId } });
      await prisma.chatParticipant.deleteMany({ where: { chatId: privateRoomId } });
      await prisma.chatRoom.deleteMany({ where: { id: privateRoomId } });
    });

    beforeEach(() => {
      if (capture) capture.events.length = 0;
      if (actorA) actorA.local.length = 0;
      if (actorB) actorB.local.length = 0;
    });

    test('typing reaches a group chat and stops at a private block, both ways', async () => {
      await actorB.handlers.typing({ isTyping: true, roomId: privateRoomId, userName: 'B' });
      await actorA.handlers.typing({ isTyping: false, roomId: privateRoomId, userName: 'A' });
      expect(actorB.local.filter((e) => e.broadcast)).toEqual([]);
      expect(actorA.local.filter((e) => e.broadcast)).toEqual([]);
      expect(named(capture.events, 'typing')).toEqual([]);
      expect(named(capture.events, 'typing:start')).toEqual([]);
      expect(named(capture.events, 'typing:stop')).toEqual([]);

      await actorB.handlers.typing({ isTyping: true, roomId, userName: 'B' });
      const sent = actorB.local.filter((e) => e.broadcast);
      expect(sent.map((e) => e.event).sort()).toEqual(['typing', 'typing:start']);
      expect(sent.every((e) => e.room === roomId)).toBe(true);
    });

    test('reactions are not stored across a private block, and a group reaction still is', async () => {
      await actorB.handlers.addReaction({ messageId: msgFromA.id, emoji: '👍', roomId: privateRoomId });
      expect(await prisma.reaction.count({ where: { messageId: msgFromA.id, userId: 'blk_user_b' } })).toBe(0);
      const echoes = named(capture.events, 'messageReaction');
      expect(echoes).toHaveLength(1);
      expect(echoes[0].rooms).toEqual(['user_blk_user_b']);
      expect(echoes[0].payload.reactions['👍'].userIds).toContain('blk_user_b');
      expect(JSON.stringify(echoes[0].payload).toLowerCase()).not.toMatch(/block/);

      capture.events.length = 0;
      await actorA.handlers.addReaction({ messageId: msgFromB.id, emoji: '🔥', roomId: privateRoomId });
      expect(await prisma.reaction.count({ where: { messageId: msgFromB.id } })).toBe(0);
      expect(named(capture.events, 'messageReaction')).toEqual([]);
      expect(JSON.stringify(actorA.local).toLowerCase()).not.toMatch(/block/);

      capture.events.length = 0;
      await actorB.handlers.addReaction({ messageId: groupFromA.id, emoji: '✅', roomId });
      expect(await prisma.reaction.count({
        where: { messageId: groupFromA.id, userId: 'blk_user_b', emoji: '✅' },
      })).toBe(1);
      expect(named(capture.events, 'messageReaction').some((e) => e.rooms.includes(roomId))).toBe(true);
    });

    test('a mutual block still echoes the reaction only to the actor', async () => {
      await prisma.userBlock.upsert({
        where: { blockerId_blockedId: { blockerId: 'blk_user_b', blockedId: 'blk_user_a' } },
        update: {},
        create: { blockerId: 'blk_user_b', blockedId: 'blk_user_a' },
      });
      try {
        await actorA.handlers.addReaction({ messageId: msgFromB.id, emoji: '❤️', roomId: privateRoomId });
        expect(await prisma.reaction.count({ where: { messageId: msgFromB.id, userId: 'blk_user_a' } })).toBe(0);
        const echoes = named(capture.events, 'messageReaction');
        expect(echoes).toHaveLength(1);
        expect(echoes[0].rooms).toEqual(['user_blk_user_a']);
        expect(echoes[0].rooms).not.toContain(privateRoomId);
      } finally {
        await prisma.userBlock.deleteMany({ where: { blockerId: 'blk_user_b', blockedId: 'blk_user_a' } });
      }
    });

    test('edits are not stored across a private block, and a group edit still is', async () => {
      await actorB.handlers.editMessage({ messageId: msgFromB.id, text: 'secret edit', roomId: privateRoomId });
      const hidden = await prisma.message.findUnique({ where: { id: msgFromB.id } });
      expect(hidden.text).toEqual('private from B');
      expect(hidden.isEdited).toBe(false);
      expect(await prisma.messageEdit.count({ where: { messageId: msgFromB.id } })).toBe(0);
      const echoes = named(capture.events, 'messageUpdated');
      expect(echoes).toHaveLength(1);
      expect(echoes[0].rooms).toEqual(['user_blk_user_b']);
      expect(echoes[0].payload).toMatchObject({
        id: msgFromB.id,
        text: 'secret edit',
        isEdited: true,
        roomId: privateRoomId,
      });
      expect(JSON.stringify(echoes[0].payload).toLowerCase()).not.toMatch(/block/);

      capture.events.length = 0;
      await actorA.handlers.editMessage({ messageId: msgFromA.id, text: 'blocker edit', roomId: privateRoomId });
      const kept = await prisma.message.findUnique({ where: { id: msgFromA.id } });
      expect(kept.text).toEqual('private from A');
      expect(kept.isEdited).toBe(false);
      expect(named(capture.events, 'messageUpdated')).toEqual([]);
      expect(JSON.stringify(actorA.local).toLowerCase()).not.toMatch(/block/);

      capture.events.length = 0;
      await actorB.handlers.editMessage({ messageId: groupFromB.id, text: 'group edited', roomId });
      const edited = await prisma.message.findUnique({ where: { id: groupFromB.id } });
      expect(edited.text).toEqual('group edited');
      expect(edited.isEdited).toBe(true);
      expect(named(capture.events, 'messageUpdated').some((e) => e.rooms.includes(roomId))).toBe(true);
    });

    test('read receipts stop at a private block and still fire in a group', async () => {
      await actorB.handlers.markAsRead({ roomId: privateRoomId });
      await actorA.handlers.markAsRead({ roomId: privateRoomId });
      expect(named(capture.events, 'messageStatusUpdate')).toEqual([]);
      expect((await prisma.message.findUnique({ where: { id: msgFromA.id } })).status).toEqual('sent');
      expect((await prisma.message.findUnique({ where: { id: msgFromB.id } })).status).toEqual('sent');

      capture.events.length = 0;
      await actorB.handlers.markAsRead({ roomId });
      const receipts = named(capture.events, 'messageStatusUpdate');
      expect(receipts.some((e) => e.rooms.includes(roomId) && e.payload.roomId === roomId && e.payload.status === 'read')).toBe(true);
      expect((await prisma.message.findUnique({ where: { id: groupFromA.id } })).status).toEqual('read');
    });

    test('a blocked sender keeps the quote on the fake sent echo', async () => {
      await actorB.handlers.message({
        text: 'quoted ping',
        roomId: privateRoomId,
        senderName: 'B',
        tempId: 'tmp-reply-1',
        replyTo: { id: msgFromA.id, text: 'private from A', senderName: 'A' },
      });
      const echoed = named(capture.events, 'message').filter((e) => e.rooms.includes('user_blk_user_b'));
      expect(echoed.length).toBeGreaterThan(0);
      expect(echoed[0].payload.replyTo).toMatchObject({
        id: msgFromA.id,
        text: 'private from A',
        senderName: 'A',
      });
      expect(echoed[0].payload.status).toEqual('sent');
      expect(named(capture.events, 'message').some((e) => e.rooms.includes(privateRoomId))).toBe(false);
      expect(await prisma.message.findFirst({ where: { chatRoomId: privateRoomId, text: 'quoted ping' } })).toBeNull();
    });

    test('a failed block lookup does not deliver typing, reactions, edits, or read receipts', async () => {
      const blocks = require('../utils/blocks');
      const spy = jest.spyOn(blocks, 'getPrivateChatBlock').mockRejectedValue(new Error('lookup down'));
      try {
        await actorB.handlers.typing({ isTyping: true, roomId: privateRoomId, userName: 'B' });
        expect(actorB.local.filter((e) => e.broadcast)).toEqual([]);

        await actorB.handlers.addReaction({ messageId: msgFromA.id, emoji: '❌', roomId: privateRoomId });
        expect(await prisma.reaction.count({ where: { messageId: msgFromA.id, userId: 'blk_user_b' } })).toBe(0);
        expect(named(capture.events, 'messageReaction')).toEqual([]);

        await actorB.handlers.editMessage({ messageId: msgFromB.id, text: 'should not land', roomId: privateRoomId });
        expect((await prisma.message.findUnique({ where: { id: msgFromB.id } })).text).toEqual('private from B');
        expect(named(capture.events, 'messageUpdated')).toEqual([]);

        await actorB.handlers.markAsRead({ roomId: privateRoomId });
        expect((await prisma.message.findUnique({ where: { id: msgFromA.id } })).status).toEqual('sent');
        expect(named(capture.events, 'messageStatusUpdate')).toEqual([]);

        const leaked = JSON.stringify(actorB.local).toLowerCase();
        expect(leaked).not.toMatch(/block/);
        expect(leaked).not.toMatch(/user_blocked/);
      } finally {
        spy.mockRestore();
      }
    });
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
