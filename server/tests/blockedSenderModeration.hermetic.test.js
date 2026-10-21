/**
 * Hermetic: a sender who has been blocked is moderated like anyone else. Uses the REAL
 * assessOutgoingMessage (only prisma, the AI moderator and notifications are mocked), so the
 * flag record is proven, not assumed. Nothing is delivered and nobody is notified.
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
          if (!m[method]) m[method] = jest.fn(async () => (String(method) === 'findMany' ? [] : null));
          return m[method];
        },
      });
    }
    return target[model];
  },
});

const mockGetBlock = jest.fn();
const mockCheckMessage = jest.fn();
const mockCounters = jest.fn(async () => {});
const mockPush = jest.fn(async () => {});
const mockNotify = jest.fn(async () => {});

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
jest.mock('../moderationInstance', () => ({ moderator: { checkMessage: (...a) => mockCheckMessage(...a) } }));
jest.mock('../services/counterService', () => ({
  ...jest.requireActual('../services/counterService'),
  broadcastCounters: (...a) => mockCounters(...a),
}));
jest.mock('../services/notificationService', () => ({
  NotificationService: class {
    sendPushOnly(...a) { return mockPush(...a); }
    sendNotification(...a) { return mockNotify(...a); }
  },
}));
jest.mock('../workers/reviewWorker', () => ({ processReviewQueue: jest.fn() }));
jest.mock('../workers/cleanupWorker', () => ({ startCleanupWorker: jest.fn(), stopCleanupWorker: jest.fn() }));

const { io } = require('../index');
const { sendRateLimiter } = require('../services/chatSafety');

const ROOM = 'room_pm';
const ADULT = 'adult_sender';
const MINOR = 'minor_receiver';
const yearsAgo = (n) => { const d = new Date(); d.setFullYear(d.getFullYear() - n); d.setDate(d.getDate() - 2); return d; };

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

async function connect(userId) {
  const local = [];
  const handlers = {};
  const socket = {
    id: `sock_${Math.random().toString(36).slice(2, 8)}`, userId, data: {}, rooms: new Set(), handshake: {},
    join(r) { this.rooms.add(String(r)); }, leave(r) { this.rooms.delete(String(r)); },
    emit(event, payload) { local.push({ event, payload }); },
    to(room) { return { emit: (event, payload) => local.push({ event, payload, room: String(room), broadcast: true }) }; },
    on(event, fn) { handlers[event] = fn; },
  };
  const [onConnection] = io.listeners('connection');
  await onConnection(socket);
  return { handlers, local };
}

let capture;
let n = 0;
beforeEach(() => {
  jest.clearAllMocks();
  capture = installBroadcastCapture();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(sendRateLimiter, 'allow').mockResolvedValue(true);
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://hermetic';
  // The minor blocked the adult; the adult is writing to the minor in a private chat.
  mockGetBlock.mockResolvedValue({ otherId: MINOR, senderIsBlocked: true });
  mockPrisma.chatRoom.findUnique.mockResolvedValue({
    id: ROOM, type: 'PRIVATE', participants: [{ userId: ADULT }, { userId: MINOR }],
  });
  mockPrisma.user.findMany.mockResolvedValue([{ id: MINOR, birthDate: yearsAgo(15) }]);
  mockPrisma.user.findUnique.mockResolvedValue({ id: ADULT, name: 'Adult', imageUrl: null, birthDate: yearsAgo(40) });
  mockPrisma.message.create.mockResolvedValue({
    id: 'm1', userId: ADULT, text: 'x', createdAt: new Date(), user: { id: ADULT, name: 'Adult', imageUrl: null }, replyTo: null,
  });
});
afterEach(() => { capture.restore(); });

const send = async (text) => {
  const c = await connect(ADULT);
  await c.handlers.message({ text, roomId: ROOM, tempId: `t${++n}`, senderName: 'Adult' });
  return c;
};
const notifiedAnyone = () =>
  mockPush.mock.calls.length + mockNotify.mock.calls.length > 0
  || mockCounters.mock.calls.length > 0
  || capture.events.some((e) => e.event === 'chat:sync' || e.rooms.includes(`user_${MINOR}`) || e.rooms.includes(ROOM));

test('flagged content from a blocked adult to a minor: moderated, recorded, kept private, nobody notified', async () => {
  mockCheckMessage.mockResolvedValue({ isSafe: false, reviewNeeded: false });
  const { local } = await send('send me your whatsapp number');

  expect(mockCheckMessage).toHaveBeenCalled();
  // Moderation trail exists for the adult-to-minor attempt, exactly as for an unblocked sender.
  expect(mockPrisma.flaggedMessage.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ userId: ADULT, status: 'PENDING_REVIEW' }),
  }));
  // Stored as moderation-blocked (visible only to its author), echoed to the sender only.
  expect(mockPrisma.message.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ status: 'blocked' }),
  }));
  expect(local.find((l) => l.event === 'messageFailed')).toBeUndefined();
  expect(notifiedAnyone()).toBe(false);
});

test('clean message from a blocked adult: moderated, acked to the sender only, not stored, nobody notified', async () => {
  mockCheckMessage.mockResolvedValue({ isSafe: true });
  await send('send me your whatsapp number');

  expect(mockCheckMessage).toHaveBeenCalled();
  expect(mockPrisma.message.create).not.toHaveBeenCalled();
  const ack = capture.events.find((e) => e.event === 'message');
  expect(ack.rooms).toEqual([`user_${ADULT}`]);
  expect(ack.payload.status).toBe('sent');
  expect(notifiedAnyone()).toBe(false);
});

test('flagged content produces the same flag record whether or not the sender is blocked', async () => {
  mockCheckMessage.mockResolvedValue({ isSafe: false, reviewNeeded: false });
  await send('send me your whatsapp number');
  const blockedCall = mockPrisma.flaggedMessage.create.mock.calls[0][0].data;

  jest.clearAllMocks();
  mockGetBlock.mockResolvedValue(null);
  mockPrisma.chatRoom.findUnique.mockResolvedValue({ id: ROOM, type: 'PRIVATE', participants: [{ userId: ADULT }, { userId: MINOR }] });
  mockPrisma.user.findMany.mockResolvedValue([{ id: MINOR, birthDate: yearsAgo(15) }]);
  mockPrisma.user.findUnique.mockResolvedValue({ id: ADULT, name: 'Adult', imageUrl: null, birthDate: yearsAgo(40) });
  mockPrisma.message.create.mockResolvedValue({ id: 'm2', userId: ADULT, text: 'x', createdAt: new Date(), user: { id: ADULT, name: 'Adult', imageUrl: null }, replyTo: null });
  jest.spyOn(sendRateLimiter, 'allow').mockResolvedValue(true);
  await send('send me your whatsapp number');
  const plainCall = mockPrisma.flaggedMessage.create.mock.calls[0][0].data;

  expect(blockedCall).toEqual(plainCall);
});
