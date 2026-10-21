/**
 * Hermetic (prisma + auth mocked, no DB): directory serializers, friend-request ordering,
 * and a guard that no serializer returns an email-shaped name.
 */
const request = require('supertest');
const express = require('express');

const mockPrisma = new Proxy({}, {
  get(target, model) {
    if (model === 'then') return undefined;
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

jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../utils/auth', () => ({
  authenticateToken: (req, _res, next) => { req.user = { id: 'viewer', name: 'Viewer' }; next(); },
  attachOptionalUser: (_req, _res, next) => next(),
  invalidateAccountState: jest.fn(),
  invalidateClerkUser: jest.fn(),
}));
jest.mock('../utils/userSync', () => ({ safeUpsertUserFromAuth: jest.fn(async () => {}) }));
jest.mock('../utils/blocks', () => ({
  ...jest.requireActual('../utils/blocks'),
  getBlockedByMe: jest.fn(async () => []),
}));
jest.mock('../services/counterService', () => ({
  getCounters: jest.fn(async () => ({})),
  broadcastCounters: jest.fn(async () => {}),
}));
const mockSend = jest.fn(async () => {});
jest.mock('../services/notificationService', () => ({
  NotificationService: class { sendNotification(...a) { return mockSend(...a); } },
}));

const usersRouter = require('../routes/users');

const app = express();
app.use(express.json());
app.use('/api/users', usersRouter);

const yearsAgo = (n) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  d.setDate(d.getDate() - 2);
  return d;
};
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  for (const model of ['user', 'userBlock', 'friendship', 'friendRequest', 'notification', 'chatParticipant']) {
    for (const method of ['findMany', 'findFirst', 'findUnique', 'create', 'deleteMany']) {
      mockPrisma[model][method].mockReset();
      mockPrisma[model][method].mockResolvedValue(method === 'findMany' ? [] : null);
    }
  }
});

describe('GET /users/search', () => {
  const rows = [
    { id: 'minor1', name: 'Kid', imageUrl: null, city: 'Haifa', birthDate: yearsAgo(15) },
    { id: 'adult1', name: 'kid@example.com', imageUrl: null, city: 'Tel Aviv', birthDate: yearsAgo(30) },
    { id: 'friendminor', name: 'Pal', imageUrl: null, city: 'Eilat', birthDate: yearsAgo(14) },
  ];

  test('never selects, matches on, or returns an email; scrubs email-shaped names', async () => {
    mockPrisma.user.findMany.mockResolvedValue(rows);
    mockPrisma.friendship.findMany.mockResolvedValue([{ userAId: 'friendminor', userBId: 'viewer' }]);
    const res = await request(app).get('/api/users/search').query({ q: 'kid' });
    expect(res.status).toBe(200);

    const args = mockPrisma.user.findMany.mock.calls[0][0];
    expect(args.select.email).toBeUndefined();
    expect(JSON.stringify(args.where.AND[2])).not.toMatch(/email/);
    expect(JSON.stringify(res.body)).not.toMatch(EMAIL_RE);
    expect(res.body.every((u) => !('email' in u))).toBe(true);
    expect(res.body.find((u) => u.id === 'adult1').name).toBe('משתמש');
  });

  test('a minor\'s city is hidden from non-friends, shown to friends; adults keep theirs', async () => {
    mockPrisma.user.findMany.mockResolvedValue(rows);
    mockPrisma.friendship.findMany.mockResolvedValue([{ userAId: 'friendminor', userBId: 'viewer' }]);
    const res = await request(app).get('/api/users/search').query({ q: 'x' });
    const byId = Object.fromEntries(res.body.map((u) => [u.id, u]));
    expect(byId.minor1.city).toBeNull();
    expect(byId.friendminor.city).toBe('Eilat');
    expect(byId.adult1.city).toBe('Tel Aviv');
  });

  test('canAddFriend does not single out friends-only minors', async () => {
    mockPrisma.user.findMany.mockResolvedValue(rows);
    const res = await request(app).get('/api/users/search').query({ q: 'x' });
    expect(new Set(res.body.map((u) => u.canAddFriend))).toEqual(new Set([true]));
  });
});

describe('GET /users', () => {
  test('same city rule, scrubbed names, no email field', async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'minor1', name: 'Kid', imageUrl: null, city: 'Haifa', birthDate: yearsAgo(15) },
      { id: 'adult1', name: 'a@b.com', imageUrl: null, city: 'Tel Aviv', birthDate: null },
    ]);
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(200);
    expect(res.body.find((u) => u.id === 'minor1').city).toBeNull();
    expect(res.body.find((u) => u.id === 'adult1').city).toBe('Tel Aviv');
    expect(JSON.stringify(res.body)).not.toMatch(EMAIL_RE);
    expect(res.body.map((u) => u.canAddFriend)).toEqual([true, true]);
  });
});

describe('POST /users/requests: blocked and unblocked senders are indistinguishable', () => {
  const post = () => request(app).post('/api/users/requests').send({ receiverId: 'target' });
  const setup = ({ blocked, target, viewerBirth = yearsAgo(30), existing = null }) => {
    mockPrisma.user.findUnique.mockImplementation(async ({ where }) => (
      where.id === 'target' ? { id: 'target', ...target } : { id: 'viewer', birthDate: viewerBirth }
    ));
    mockPrisma.userBlock.findFirst.mockResolvedValue(blocked ? { id: 'b1' } : null);
    mockPrisma.friendRequest.findFirst.mockResolvedValue(existing);
    mockPrisma.friendRequest.create.mockImplementation(async ({ data }) => ({ id: 'fr1', status: 'PENDING', createdAt: new Date(), ...data }));
  };
  const minorTarget = { birthDate: yearsAgo(15), privacyFriends: null };

  test.each([true, false])('adult -> friends-only minor is 403 PROFILE_FRIENDS_ONLY (blocked=%s)', async (blocked) => {
    setup({ blocked, target: minorTarget });
    const res = await post();
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PROFILE_FRIENDS_ONLY');
    expect(mockPrisma.friendRequest.create).not.toHaveBeenCalled();
  });

  test('blocked adult -> adult gets a normal 201; the row is real but nobody is notified', async () => {
    setup({ blocked: true, target: { birthDate: yearsAgo(30), privacyFriends: null } });
    const res = await post();
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ requesterId: 'viewer', receiverId: 'target', status: 'PENDING' });
    expect(mockPrisma.friendRequest.create).toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('blocked minor -> friends-only minor also gets the normal 201', async () => {
    setup({ blocked: true, target: minorTarget, viewerBirth: yearsAgo(14) });
    const res = await post();
    expect(res.status).toBe(201);
  });

  test('unblocked adult -> adult really creates the request', async () => {
    setup({ blocked: false, target: { birthDate: yearsAgo(30), privacyFriends: null } });
    const res = await post();
    expect(res.status).toBe(201);
    expect(mockPrisma.friendRequest.create).toHaveBeenCalled();
  });

  test('a duplicate pending request keeps the original 400 "Request already exists" contract', async () => {
    setup({
      blocked: false,
      target: { birthDate: yearsAgo(30), privacyFriends: null },
      existing: { id: 'fr0', requesterId: 'viewer', receiverId: 'target', status: 'PENDING', createdAt: new Date() },
    });
    const res = await post();
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Request already exists');
    expect(mockPrisma.friendRequest.create).not.toHaveBeenCalled();
  });
});

// A stateful fake of the friendRequest table, so a retry sequence can be replayed.
function statefulRequests() {
  const rows = [];
  mockPrisma.friendRequest.findFirst.mockImplementation(async ({ where }) => (
    rows.find((r) => (where.OR || [where]).some((c) => c.requesterId === r.requesterId && c.receiverId === r.receiverId)) || null
  ));
  mockPrisma.friendRequest.create.mockImplementation(async ({ data }) => {
    const row = { id: `fr${rows.length + 1}`, status: 'PENDING', createdAt: new Date(), ...data };
    rows.push(row);
    return row;
  });
  return rows;
}

describe('retry sequences are identical for blocked and unblocked senders', () => {
  const post = () => request(app).post('/api/users/requests').send({ receiverId: 'target' });
  const run = async (blocked, target, viewerBirth) => {
    mockPrisma.user.findUnique.mockImplementation(async ({ where }) => (
      where.id === 'target' ? { id: 'target', ...target } : { id: 'viewer', birthDate: viewerBirth }
    ));
    mockPrisma.userBlock.findFirst.mockResolvedValue(blocked ? { id: 'b1' } : null);
    statefulRequests();
    mockSend.mockClear();
    const seq = [];
    for (let i = 0; i < 3; i += 1) {
      const r = await post();
      seq.push([r.status, r.body.error || null, r.body.code || null]);
    }
    return { seq, notified: mockSend.mock.calls.length };
  };

  test.each([
    ['adult -> adult', { birthDate: yearsAgo(30), privacyFriends: null }, yearsAgo(30)],
    ['minor -> minor', { birthDate: yearsAgo(15), privacyFriends: null }, yearsAgo(14)],
    ['adult -> minor with EVERYONE', { birthDate: yearsAgo(15), privacyFriends: 'EVERYONE' }, yearsAgo(30)],
    ['adult -> friends-only minor', { birthDate: yearsAgo(15), privacyFriends: null }, yearsAgo(30)],
  ])('%s', async (_name, target, viewerBirth) => {
    const plain = await run(false, target, viewerBirth);
    const blocked = await run(true, target, viewerBirth);
    expect(blocked.seq).toEqual(plain.seq);
    expect(blocked.notified).toBe(0);
  });

  test('a blocked sender request is hidden from the receiver and cannot be accepted', async () => {
    mockPrisma.userBlock.findMany.mockResolvedValue([{ blockerId: 'viewer', blockedId: 'asker' }]);
    mockPrisma.friendRequest.findMany.mockResolvedValue([]);
    await request(app).get('/api/users/viewer/requests/incoming');
    const where = mockPrisma.friendRequest.findMany.mock.calls[0][0].where;
    expect(where.requesterId).toEqual({ notIn: ['asker'] });

    mockPrisma.friendRequest.findUnique.mockResolvedValue({ id: 'fr9', requesterId: 'asker', receiverId: 'viewer' });
    mockPrisma.userBlock.findFirst.mockResolvedValue({ id: 'b1' });
    const accept = await request(app).post('/api/users/requests/fr9/accept');
    expect(accept.status).toBe(404);
    const decline = await request(app).post('/api/users/requests/fr9/decline');
    expect(decline.status).toBe(404);
  });
});

describe('GET /users/:id/chats unread', () => {
  test('per-room unread ignores people the viewer blocked', async () => {
    const { getBlockedByMe } = require('../utils/blocks');
    getBlockedByMe.mockResolvedValue(['bad']);
    mockPrisma.chatParticipant.findMany.mockResolvedValue([{
      chatId: 'r1',
      chat: { id: 'r1', type: 'PRIVATE', participants: [{ userId: 'viewer', user: { id: 'viewer' } }, { userId: 'bad', user: { id: 'bad', name: 'Bad' } }], messages: [] },
    }]);
    mockPrisma.message.groupBy.mockResolvedValue([]);
    const res = await request(app).get('/api/users/viewer/chats');
    expect(res.status).toBe(200);
    expect(mockPrisma.message.groupBy.mock.calls[0][0].where.userId).toEqual({ notIn: ['viewer', 'bad'] });
  });
});

describe('GET /users/blocks', () => {
  test('never returns an email-shaped name', async () => {
    mockPrisma.userBlock.findMany.mockResolvedValue([
      { blockedId: 'u1', createdAt: new Date(), blocked: { id: 'u1', name: 'someone@example.com', imageUrl: null } },
    ]);
    const res = await request(app).get('/api/users/blocks');
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(EMAIL_RE);
  });
});

describe('shared mappers never return an email-shaped name', () => {
  const { publicUser, publicDisplayName } = require('../utils/publicName');

  test('publicUser / publicDisplayName', () => {
    expect(publicUser({ id: '1', name: 'a@b.co', imageUrl: null }).name).toBe('משתמש');
    expect(publicUser({ id: '1', name: 'Dana' }).name).toBe('Dana');
    expect(publicDisplayName('x@y.org', null)).toBeNull();
  });

  test('game roster mapper', () => {
    const { mapGameForClient } = require('../services/gameService');
    const game = {
      id: 'g1', title: 't', start: new Date(), end: new Date(), maxPlayers: 10, organizerId: 'o',
      field: { name: 'F', location: 'L', city: 'C' }, teams: [], roles: [{ userId: 'm', role: 'MANAGER', user: { id: 'm', name: 'mgr@x.com', imageUrl: null } }],
      participants: [{ userId: 'u', status: 'CONFIRMED', isGuest: false, user: { id: 'u', name: 'p@x.com', email: 'p@x.com', imageUrl: null, birthDate: null } }],
    };
    const out = mapGameForClient(game);
    expect(JSON.stringify(out)).not.toMatch(EMAIL_RE);
  });
});
