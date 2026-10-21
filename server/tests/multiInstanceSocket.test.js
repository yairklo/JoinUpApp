/**
 * Two Socket.IO server instances + one real Redis (skipped without TEST_REDIS_URL).
 * Proves cross-instance delivery through the real attachSocketAdapter, the bridge de-dup
 * (io.local) regression, cluster-wide presence, and graceful degradation with Redis down.
 */
const http = require('http');
const { Server } = require('socket.io');
const { io: connectClient } = require('socket.io-client');
const { attachSocketAdapter } = require('../socket/adapter');
const { applySocketEvent } = require('../utils/socketBridge');
const { isUserOnline, hasOtherUserInRoom, resetPresenceBreaker } = require('../utils/socketPresence');
const { describeRedis, TEST_REDIS_URL, uniqueId, sleep, waitFor, newClient } = require('./helpers/redisTest');

const quiet = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

async function makeNode(url, key) {
  const httpServer = http.createServer();
  const io = new Server(httpServer, { transports: ['websocket'] });
  const adapter = attachSocketAdapter(io, { url, enabled: true, key, logger: quiet });
  io.on('connection', (socket) => {
    socket.data.userId = socket.handshake.auth.userId;
    socket.join(`user_${socket.data.userId}`);
    socket.on('join', (room) => socket.join(room));
    socket.on('relay', ({ room, event, payload }) => socket.to(room).emit(event, payload));
  });
  await new Promise((r) => httpServer.listen(0, '127.0.0.1', r));
  return { io, httpServer, adapter, port: httpServer.address().port };
}

async function closeNode(n) {
  await new Promise((r) => n.io.close(() => r()));
  await n.adapter.close();
}

function connect(node, userId) {
  const received = [];
  const socket = connectClient(`http://127.0.0.1:${node.port}`, {
    transports: ['websocket'], auth: { userId }, forceNew: true, reconnection: false,
  });
  socket.onAny((event, payload) => received.push({ event, payload }));
  return new Promise((resolve, reject) => {
    socket.on('connect', () => resolve({ socket, received, count: (e) => received.filter((r) => r.event === e).length }));
    socket.on('connect_error', reject);
  });
}

describeRedis('multi-instance Socket.IO over a real Redis', () => {
  let key; let A; let B; let X; let Y;

  beforeAll(async () => {
    key = uniqueId('sock');
    A = await makeNode(TEST_REDIS_URL, key);
    B = await makeNode(TEST_REDIS_URL, key);
    await waitFor(() => A.adapter.sub.status === 'ready' && B.adapter.sub.status === 'ready');
    // Deterministic readiness: a server-side event from A must be heard by B (and back) before tests run.
    let heardByB = false; let heardByA = false;
    B.io.on('probe', () => { heardByB = true; });
    A.io.on('probe', () => { heardByA = true; });
    await waitFor(() => { A.io.serverSideEmit('probe'); B.io.serverSideEmit('probe'); return heardByA && heardByB; }, { timeout: 8000, interval: 100 });
  });

  afterAll(async () => {
    await closeNode(A);
    await closeNode(B);
  });

  beforeEach(async () => {
    resetPresenceBreaker();
    X = await connect(A, 'u1');
    Y = await connect(B, 'u2');
    X.socket.emit('join', 'r1');
    Y.socket.emit('join', 'r1');
    await waitFor(async () => (await A.io.in('r1').fetchSockets()).length === 2);
  });

  afterEach(() => {
    X.socket.close();
    Y.socket.close();
  });

  test('emit from instance A reaches clients on A and B exactly once', async () => {
    A.io.to('r1').emit('ping', { n: 1 });
    await waitFor(() => X.count('ping') >= 1 && Y.count('ping') >= 1);
    await sleep(250);
    expect(X.count('ping')).toBe(1);
    expect(Y.count('ping')).toBe(1);
  });

  test('user-room emit from instance B (REST route style) reaches only that user on A', async () => {
    B.io.to('user_u1').emit('notification', { id: 9 });
    await waitFor(() => X.count('notification') === 1);
    await sleep(200);
    expect(X.count('notification')).toBe(1);
    expect(Y.count('notification')).toBe(0);
  });

  test('broadcast reaches every instance', async () => {
    A.io.emit('all', { ok: true });
    await waitFor(() => X.count('all') === 1 && Y.count('all') === 1);
  });

  test('socket.to(room) from a client on A excludes the sender and includes the client on B', async () => {
    X.socket.emit('relay', { room: 'r1', event: 'typing', payload: { u: 'u1' } });
    await waitFor(() => Y.count('typing') === 1);
    await sleep(200);
    expect(X.count('typing')).toBe(0);
    expect(Y.count('typing')).toBe(1);
  });

  test('fetchSockets and the presence helpers see sockets on the other instance', async () => {
    expect(await isUserOnline(A.io, 'u2')).toBe(true); // u2 is only connected to B
    expect(await isUserOnline(B.io, 'u1')).toBe(true);
    expect(await isUserOnline(A.io, 'nobody', 5000)).toBe(false); // generous soft timeout: unknown would read as online
    expect(await hasOtherUserInRoom(A.io, 'r1', 'u1')).toBe(true); // u2 on B counts
    Y.socket.emit('leaveRoom');
    const solo = await connect(A, 'u3');
    solo.socket.emit('join', 'solo');
    await waitFor(async () => (await A.io.in('solo').fetchSockets()).length === 1);
    expect(await hasOtherUserInRoom(B.io, 'solo', 'u3', 5000)).toBe(false); // only the sender's own socket
    solo.socket.close();
  });

  test('bridge de-dup: a worker event applied via io.local on every instance is delivered exactly once', async () => {
    const msg = { rooms: ['r1'], event: 'pick:state', payload: { v: 1 }, broadcast: false };
    applySocketEvent(A.io, msg); // each instance's bridge subscriber does this
    applySocketEvent(B.io, msg);
    await waitFor(() => X.count('pick:state') >= 1 && Y.count('pick:state') >= 1);
    await sleep(300);
    expect(X.count('pick:state')).toBe(1);
    expect(Y.count('pick:state')).toBe(1);
  });

  test('cross-instance delivery resumes after Redis drops every client connection', async () => {
    const admin = newClient();
    try {
      await admin.call('CLIENT', 'KILL', 'TYPE', 'pubsub');
      await admin.call('CLIENT', 'KILL', 'TYPE', 'normal');
    } finally {
      admin.disconnect();
    }
    // ioredis reconnects (retry forever) and re-subscribes; poll until B hears A again.
    await waitFor(async () => {
      const before = Y.count('after-blip');
      A.io.to('r1').emit('after-blip', { v: 1 });
      await sleep(200);
      return Y.count('after-blip') > before;
    }, { timeout: 10000, interval: 100 });
    expect(X.count('after-blip')).toBeGreaterThanOrEqual(1); // local delivery never stopped
  });

  test('negative control: plain io.to().emit in the bridge handler duplicates (proves the test can fail)', async () => {
    A.io.to('r1').emit('dup', { v: 1 });
    B.io.to('r1').emit('dup', { v: 1 });
    await waitFor(() => X.count('dup') >= 2 && Y.count('dup') >= 2);
    expect(X.count('dup')).toBe(2);
    expect(Y.count('dup')).toBe(2);
  });
});

describeRedis('Socket.IO adapter with Redis unreachable', () => {
  test('attach does not throw, local clients are served, and emits do not raise unhandled rejections', async () => {
    const unhandled = [];
    const onUnhandled = (r) => unhandled.push(r);
    process.on('unhandledRejection', onUnhandled);
    // ioredis logs reconnect errors via console.warn (deduped); keep them out of the test output
    // and make sure nothing logs after teardown.
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const C = await makeNode('redis://127.0.0.1:1', uniqueId('down'));
    try {
      expect(C.adapter.enabled).toBe(true);
      const c1 = await connect(C, 'u1');
      const c2 = await connect(C, 'u2');
      c1.socket.emit('join', 'r');
      c2.socket.emit('join', 'r');
      await waitFor(async () => (await C.io.in('r').fetchSockets().catch(() => [])).length === 2, { timeout: 8000 })
        .catch(() => {}); // fetchSockets may fail while Redis is down; local delivery is what matters
      c1.socket.emit('relay', { room: 'r', event: 'local', payload: 1 });
      C.io.to('user_u2').emit('direct', { ok: 1 });
      await waitFor(() => c2.count('local') === 1 && c2.count('direct') === 1);
      expect(await isUserOnline(C.io, 'u2')).toBe(true); // falls back to the local view
      c1.socket.close();
      c2.socket.close();
      await sleep(4000); // let ioredis retries / maxRetriesPerRequest rejections surface
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
      await new Promise((r) => C.io.close(() => r()));
      C.adapter.pub.disconnect();
      C.adapter.sub.disconnect();
      await sleep(50);
      warnSpy.mockRestore();
    }
  }, 30000);
});
