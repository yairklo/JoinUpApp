/**
 * Hermetic: prisma, blocks, chat auth, moderation and counters are all mocked, so this never
 * touches a database. Drives the real socket handlers in server/index.js for a private-chat
 * block in both directions and checks nothing leaks to, or is stored for, the other side.
 */
jest.setTimeout(20000);

const mockPrisma = new Proxy({}, {
  get(target, model) {
    if (model === 'then') return undefined;
    if (model === '$transaction') {
      if (!target.$transaction) target.$transaction = jest.fn(async (fn) => fn(mockPrisma));
      return target.$transaction;
    }
    if (!target[model]) {
      const methods = {};
      target[model] = new Proxy(methods, {
        get(m, method) {
          if (!m[method]) m[method] = jest.fn(async () => (/^findMany$/.test(String(method)) ? [] : null));
          return m[method];
        },
      });
    }
    return target[model];
  },
});

const mockGetBlock = jest.fn();
const mockAssess = jest.fn();
const mockCounters = jest.fn(async () => {});

jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../utils/auth', () => ({
  authenticateToken: (_req, _res, next) => next(),
  attachOptionalUser: (_req, _res, next) => next(),
  invalidateClerkUser: jest.fn(),
  invalidateAccountState: jest.fn(),
  clerkClient: {},
}));
jest.mock('../utils/chatAuth', () => ({
  checkChatPermission: jest.fn(async () => true),
  checkChatPermissionsBatch: jest.fn(async (_u, ids) => new Set(ids)),
}));
jest.mock('../utils/blocks', () => ({
  ...jest.requireActual('../utils/blocks'),
  getPrivateChatBlock: (...a) => mockGetBlock(...a),
  getBlockersAmong: jest.fn(async () => new Set()),
  getBlockedByMe: jest.fn(async () => []),
}));
jest.mock('../services/chatSafety', () => ({
  ...jest.requireActual('../services/chatSafety'),
  assessOutgoingMessage: (...a) => mockAssess(...a),
}));
jest.mock('../services/counterService', () => ({
  ...jest.requireActual('../services/counterService'),
  broadcastCounters: (...a) => mockCounters(...a),
}));
jest.mock('../workers/reviewWorker', () => ({ processReviewQueue: jest.fn() }));
jest.mock('../workers/cleanupWorker', () => ({ startCleanupWorker: jest.fn(), stopCleanupWorker: jest.fn() }));

const { io } = require('../index');
const { sendRateLimiter } = require('../services/chatSafety');

const ROOM = 'room_1';
const ME = 'user_me';
const OTHER = 'user_other';

// Both directions of a private-chat block, from the acting user's point of view.
const BLOCKER = { otherId: OTHER, senderIsBlocked: false }; // I blocked them
const BLOCKED = { otherId: OTHER, senderIsBlocked: true }; // they blocked me

function installBroadcastCapture() {
  const events = [];
  const adapter = io.of('/').adapter;
  const original = adapter.broadcast.bind(adapter);
  adapter.broadcast = (packet, opts) => {
    const data = packet && packet.data;
    if (Array.isArray(data) && data.length) {
      events.push({ event: data[0], payload: data[1], rooms: opts && opts.rooms ? [...opts.rooms].map(String) : [] });
    }
    return original(packet, opts);
  };
  return { events, restore() { adapter.broadcast = original; } };
}

async function connect(userId = ME) {
  const local = [];
  const handlers = {};
  const socket = {
    id: `sock_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    data: {},
    rooms: new Set(),
    handshake: {},
    join(r) { this.rooms.add(String(r)); },
    leave(r) { this.rooms.delete(String(r)); },
    emit(event, payload) { local.push({ event, payload }); },
    to(room) {
      return { emit: (event, payload) => local.push({ event, payload, room: String(room), broadcast: true }) };
    },
    on(event, fn) { handlers[event] = fn; },
  };
  const [onConnection] = io.listeners('connection');
  await onConnection(socket);
  return { handlers, local };
}

let capture;
beforeEach(() => {
  jest.clearAllMocks();
  mockGetBlock.mockReset();
  mockAssess.mockReset();
  mockAssess.mockResolvedValue({ status: 'sent', recipientIds: [OTHER] });
  capture = installBroadcastCapture();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(sendRateLimiter, 'allow').mockResolvedValue(true);
});
afterEach(() => { capture.restore(); });

const roomBroadcasts = () => capture.events.filter((e) => e.rooms.includes(ROOM));
const ownMessage = { id: 'm1', userId: ME, chatRoomId: ROOM, text: 'old', isDeleted: false };

describe.each([['blocker', BLOCKER], ['blocked party', BLOCKED]])('%s: typing / reactions / edits / receipts', (_label, block) => {
  beforeEach(() => mockGetBlock.mockResolvedValue(block));

  test('typing is never relayed', async () => {
    const { handlers, local } = await connect();
    await handlers.typing({ roomId: ROOM, isTyping: true, userName: 'x' });
    expect(local.filter((l) => l.broadcast)).toHaveLength(0);
  });

  test('a reaction is not stored and the room is not told', async () => {
    const { handlers } = await connect();
    await handlers.addReaction({ messageId: 'm1', emoji: 'x', roomId: ROOM });
    expect(mockPrisma.reaction.create).not.toHaveBeenCalled();
    expect(mockPrisma.reaction.update).not.toHaveBeenCalled();
    expect(roomBroadcasts().filter((e) => e.event === 'messageReaction')).toHaveLength(0);
  });

  test('an edit is not stored and the room is not told', async () => {
    mockPrisma.message.findUnique.mockResolvedValue(ownMessage);
    const { handlers } = await connect();
    await handlers.editMessage({ messageId: 'm1', text: 'new', roomId: ROOM });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(roomBroadcasts().filter((e) => e.event === 'messageUpdated')).toHaveLength(0);
  });

  test('markAsRead leaves receipts alone, tells nobody, but refreshes the reader badge', async () => {
    const { handlers } = await connect();
    await handlers.markAsRead({ roomId: ROOM });
    expect(mockPrisma.message.updateMany).not.toHaveBeenCalled();
    expect(capture.events.filter((e) => e.event === 'messageStatusUpdate')).toHaveLength(0);
    expect(mockCounters).toHaveBeenCalledWith(expect.anything(), expect.anything(), ME);
  });
});

describe('control: no block', () => {
  beforeEach(() => mockGetBlock.mockResolvedValue(null));

  test('typing is relayed and receipts update', async () => {
    mockPrisma.message.updateMany.mockResolvedValue({ count: 1 });
    const { handlers, local } = await connect();
    await handlers.typing({ roomId: ROOM, isTyping: true, userName: 'x' });
    expect(local.filter((l) => l.broadcast && l.event === 'typing')).toHaveLength(1);
    await handlers.markAsRead({ roomId: ROOM });
    expect(capture.events.some((e) => e.event === 'messageStatusUpdate')).toBe(true);
  });
});

describe('a blocked pair only ever touches the acting user', () => {
  test('blocked party reaction and edit echo only to their own room', async () => {
    mockGetBlock.mockResolvedValue(BLOCKED);
    mockPrisma.message.findUnique.mockResolvedValue(ownMessage);
    const { handlers } = await connect();
    await handlers.addReaction({ messageId: 'm1', emoji: 'x', roomId: ROOM });
    await handlers.editMessage({ messageId: 'm1', text: 'new', roomId: ROOM });
    const own = capture.events.filter((e) => e.rooms.includes(`user_${ME}`));
    expect(own.map((e) => e.event)).toEqual(expect.arrayContaining(['messageReaction', 'messageUpdated']));
    expect(capture.events.some((e) => e.rooms.includes(ROOM))).toBe(false);
  });

  test('blocker reaction and edit produce no events at all', async () => {
    mockGetBlock.mockResolvedValue(BLOCKER);
    mockPrisma.message.findUnique.mockResolvedValue(ownMessage);
    const { handlers } = await connect();
    await handlers.addReaction({ messageId: 'm1', emoji: 'x', roomId: ROOM });
    await handlers.editMessage({ messageId: 'm1', text: 'new', roomId: ROOM });
    expect(capture.events.filter((e) => e.event === 'messageReaction' || e.event === 'messageUpdated')).toHaveLength(0);
  });
});

describe('message send across a block', () => {
  const sender = { id: ME, name: 'Me', imageUrl: null, birthDate: null };
  let n = 0;
  let tempId;
  // A fresh tempId per send: the server dedupes retries by (user, room, tempId).
  const send = async () => {
    tempId = `t${++n}`;
    const c = await connect();
    await c.handlers.message({ text: 'hello', roomId: ROOM, tempId, senderName: 'Me' });
    return c;
  };

  test('blocker: refused with a NON-retryable generic failure, nothing stored', async () => {
    mockGetBlock.mockResolvedValue(BLOCKER);
    const { local } = await send();
    const failed = local.find((l) => l.event === 'messageFailed');
    expect(failed.payload).toMatchObject({ tempId, code: 'SEND_FAILED', retryable: false });
    expect(JSON.stringify(local)).not.toMatch(/BLOCK/i);
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  test('blocked sender: acked like a normal send on their own room only, nothing stored', async () => {
    mockGetBlock.mockResolvedValue(BLOCKED);
    mockPrisma.user.findUnique.mockResolvedValue(sender);
    const { local } = await send();
    expect(local.find((l) => l.event === 'messageFailed')).toBeUndefined();
    const ack = capture.events.find((e) => e.event === 'message');
    expect(ack.rooms).toEqual([`user_${ME}`]);
    expect(ack.payload).toMatchObject({ status: 'sent', tempId, roomId: ROOM });
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
    expect(roomBroadcasts()).toHaveLength(0);
  });

  test('blocked sender still goes through moderation', async () => {
    mockGetBlock.mockResolvedValue(BLOCKED);
    mockPrisma.user.findUnique.mockResolvedValue(sender);
    await send();
    expect(mockAssess).toHaveBeenCalledWith(expect.objectContaining({ roomId: ROOM, text: 'hello' }));
  });

  test('blocked sender whose message moderation rejects gets the normal moderation outcome', async () => {
    mockGetBlock.mockResolvedValue(BLOCKED);
    mockAssess.mockResolvedValue({ status: 'blocked', recipientIds: [OTHER] });
    mockPrisma.user.findUnique.mockResolvedValue(sender);
    mockPrisma.message.create.mockResolvedValue({
      id: 'm9', userId: ME, text: 'hello', createdAt: new Date(), user: { id: ME, name: 'Me', imageUrl: null }, replyTo: null,
    });
    process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://hermetic';
    await send();
    expect(mockPrisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'blocked' }) }),
    );
    expect(roomBroadcasts()).toHaveLength(0);
  });

  test('blocked sender is rate limited like anyone else', async () => {
    mockGetBlock.mockResolvedValue(BLOCKED);
    sendRateLimiter.allow.mockResolvedValue(false);
    const { local } = await send();
    expect(local.find((l) => l.event === 'messageFailed').payload.code).toBe('RATE_LIMITED');
    expect(mockAssess).not.toHaveBeenCalled();
  });

  test('a failed block lookup fails closed', async () => {
    mockGetBlock.mockRejectedValue(new Error('db down'));
    const { local } = await send();
    expect(local.find((l) => l.event === 'messageFailed')).toBeDefined();
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });
});
