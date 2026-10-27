/**
 * Tier 2: the REAL server/index.js loaded twice (separate module registries => two independent
 * io/server/adapters) against one real Redis. Only external dependencies are replaced: Clerk token
 * verification (the auth middleware itself runs for real), Prisma, chat permission and moderation.
 * Skipped without TEST_REDIS_URL.
 */
jest.setTimeout(60000);

const mockDb = { created: [] };

jest.mock('@clerk/backend', () => ({ verifyToken: jest.fn(async (token) => ({ sub: token })) }));
jest.mock('../utils/auth', () => ({
  authenticateToken: (_req, _res, next) => next(),
  attachOptionalUser: (_req, _res, next) => next(),
  clerkClient: { users: { getUser: jest.fn() } },
  getClerkUserCached: jest.fn(async () => ({})),
  isAccountDeleted: jest.fn(async () => false),
}));
jest.mock('../utils/admin', () => ({ requireAdmin: (_r, _s, n) => n(), resolveIsBanned: () => false, resolveIsAdmin: () => false }));
jest.mock('../workers/reviewWorker', () => ({ processReviewQueue: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../workers/cleanupWorker', () => ({ startCleanupWorker: jest.fn(), stopCleanupWorker: jest.fn() }));
jest.mock('../moderationInstance', () => ({ moderator: {} }));
jest.mock('../utils/chatAuth', () => ({
  checkChatPermission: jest.fn(async () => true),
  checkChatPermissionsBatch: jest.fn(async (_u, ids) => new Set(ids)),
}));
jest.mock('../utils/blocks', () => ({
  ...jest.requireActual('../utils/blocks'),
  isPrivateChatBlocked: jest.fn(async () => false),
  getPrivateChatBlock: jest.fn(async () => null),
  getBlockersAmong: jest.fn(async () => new Set()),
}));
jest.mock('../services/counterService', () => ({ broadcastCounters: jest.fn(async () => {}) }));
jest.mock('../services/notificationService', () => ({
  NotificationService: class {
    sendPushOnly() { return Promise.resolve(); }
    sendNotification() { return Promise.resolve(); }
  },
}));
jest.mock('../services/chatSafety', () => ({
  ...jest.requireActual('../services/chatSafety'),
  assessOutgoingMessage: jest.fn(async () => ({ status: 'sent', recipientIds: ['U2'] })),
}));
jest.mock('../lib/prisma', () => {
  const model = () => new Proxy({}, { get: () => jest.fn(async () => null) });
  const prisma = new Proxy({}, {
    get(target, prop) {
      if (prop === 'then') return undefined;
      if (prop === 'user') {
        return { findUnique: jest.fn(async ({ where }) => ({ id: where.id, name: `Name ${where.id}`, city: null })) };
      }
      if (prop === 'message') {
        return {
          create: jest.fn(async ({ data }) => {
            mockDb.created.push(data);
            return {
              id: `m${mockDb.created.length}`, text: data.text, userId: data.userId, status: data.status,
              createdAt: new Date(), user: { id: data.userId, name: `Name ${data.userId}`, imageUrl: null }, replyTo: null,
            };
          }),
        };
      }
      if (prop === '$disconnect') return jest.fn();
      return model();
    },
  });
  return { prisma };
});

const { io: connectClient } = require('socket.io-client');
const { describeRedis, TEST_REDIS_URL, uniqueId, sleep, waitFor } = require('./helpers/redisTest');

function loadInstance() {
  let mod;
  jest.isolateModules(() => { mod = require('../index'); });
  return mod;
}

async function client(mod, token) {
  const received = [];
  const socket = connectClient(`http://127.0.0.1:${mod.server.address().port}`, {
    path: '/api/socket', transports: ['websocket'], auth: { token }, forceNew: true, reconnection: false,
  });
  socket.onAny((event, payload) => received.push({ event, payload }));
  await new Promise((resolve, reject) => {
    socket.on('connect', resolve);
    socket.on('connect_error', reject);
  });
  return { socket, received, of: (e) => received.filter((r) => r.event === e) };
}

describeRedis('real index.js x2 over one Redis', () => {
  const saved = {};
  let A; let B;

  beforeAll(async () => {
    for (const k of ['SOCKET_ADAPTER', 'REDIS_URL', 'SOCKET_ADAPTER_KEY', 'DATABASE_URL']) saved[k] = process.env[k];
    process.env.SOCKET_ADAPTER = 'redis';
    process.env.REDIS_URL = TEST_REDIS_URL;
    process.env.SOCKET_ADAPTER_KEY = uniqueId('idx');
    process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unused:unused@127.0.0.1:1/unused';
    A = loadInstance();
    B = loadInstance();
    await Promise.all([A, B].map((m) => new Promise((r) => m.server.listen(0, '127.0.0.1', r))));
    await waitFor(() => A.socketAdapter.enabled && B.socketAdapter.enabled
      && A.socketAdapter.sub.status === 'ready' && B.socketAdapter.sub.status === 'ready');
    await sleep(150);
  });

  afterAll(async () => {
    for (const m of [A, B]) {
      if (!m) continue;
      await new Promise((r) => m.io.close(() => r()));
      await m.socketAdapter.close();
    }
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });

  test('both instances attached the Redis adapter', () => {
    expect(A.socketAdapter.enabled).toBe(true);
    expect(B.socketAdapter.enabled).toBe(true);
  });

  test('an HTTP-route style emit on A reaches the user connected to B', async () => {
    const u2 = await client(B, 'U2');
    try {
      await waitFor(async () => (await A.io.in('user_U2').fetchSockets()).length === 1);
      A.app.get('io').to('user_U2').emit('notification', { id: 'n1' });
      await waitFor(() => u2.of('notification').length === 1);
      await sleep(200);
      expect(u2.of('notification')).toHaveLength(1);
    } finally {
      u2.socket.close();
    }
  });

  test('a chat message sent on A reaches the room member on B once, marked delivered', async () => {
    mockDb.created.length = 0;
    const u1 = await client(A, 'U1');
    const u2 = await client(B, 'U2');
    try {
      u1.socket.emit('joinRoom', 'room1');
      u2.socket.emit('joinRoom', 'room1');
      await waitFor(async () => (await A.io.in('room1').fetchSockets()).length === 2);

      u1.socket.emit('message', { text: 'hello from A', roomId: 'room1', tempId: 't-1' });
      await waitFor(() => u2.of('message').length >= 1 && u1.of('message').length >= 1);
      await sleep(300);

      expect(u2.of('message')).toHaveLength(1);
      expect(u2.of('message')[0].payload.text).toBe('hello from A');
      expect(u1.of('message')).toHaveLength(1); // sender echo (also on the room), not duplicated
      expect(mockDb.created).toHaveLength(1);
      // The recipient is on the OTHER instance: only the cluster-wide presence check can see it.
      expect(mockDb.created[0].status).toBe('delivered');
    } finally {
      u1.socket.close();
      u2.socket.close();
    }
  });

  test('presence: the last socket closing on another instance flips the user offline for listeners', async () => {
    const watcher = await client(A, 'U1');
    const target = await client(B, 'U2');
    try {
      watcher.socket.emit('join', 'user_U1');
      // presence subscription needs canSubscribePresence; join the listener room directly instead
      A.io.in(watcher.socket.id).socketsJoin('presence_listener_U2');
      await waitFor(async () => (await B.io.in('user_U2').fetchSockets()).length === 1);
      target.socket.close();
      await waitFor(() => watcher.of('presence:update').some((r) => r.payload.userId === 'U2' && r.payload.isOnline === false));
    } finally {
      watcher.socket.close();
    }
  });
});
