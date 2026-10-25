const request = require('supertest');

jest.setTimeout(30000);

// A minor's age, city, gender and sports must not leak through someone else's friends list
// or through friend requests. Same rule as GET /api/users/:id (profileRestricted).
const mockTokens = {
  mock_token_adult: { id: 'flmp_test_adult', name: 'Adult', avatar: null },
  mock_token_minor: { id: 'flmp_test_minor', name: 'Minor', avatar: null },
  mock_token_outsider: { id: 'flmp_test_outsider', name: 'Outsider', avatar: null },
};

jest.mock('../utils/auth', () => {
  const lookup = (req) => {
    const token = (req.headers['authorization'] || '').split(' ')[1];
    return mockTokens[token] || null;
  };
  return {
    authenticateToken: (req, res, next) => {
      const user = lookup(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      req.user = user;
      return next();
    },
    attachOptionalUser: (req, res, next) => {
      const user = lookup(req);
      if (user) req.user = user;
      next();
    },
  };
});

jest.mock('../workers/reviewWorker', () => ({ processReviewQueue: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../workers/gameReminderWorker', () => ({
  startGameReminderWorker: jest.fn().mockResolvedValue(undefined),
  checkUpcomingGames: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../workers/cleanupWorker', () => ({
  startCleanupWorker: jest.fn().mockResolvedValue(undefined),
  runCleanup: jest.fn().mockResolvedValue(undefined),
}));

const { prisma } = require('../services/gameService');
const { app } = require('../index');

const adult = 'flmp_test_adult';
const minor = 'flmp_test_minor';
const outsider = 'flmp_test_outsider';
const ids = [adult, minor, outsider];

function yearsAgo(n) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return d;
}

function orderPair(a, b) {
  return a < b ? [a, b] : [b, a];
}

const cleanup = async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.friendship.deleteMany({ where: { OR: [{ userAId: { in: ids } }, { userBId: { in: ids } }] } });
  await prisma.friendRequest.deleteMany({ where: { OR: [{ requesterId: { in: ids } }, { receiverId: { in: ids } }] } });
};

beforeAll(async () => {
  await prisma.user.upsert({
    where: { id: adult },
    update: { birthDate: yearsAgo(30), privacyFriends: 'EVERYONE' },
    create: { id: adult, name: 'Adult', birthDate: yearsAgo(30), privacyFriends: 'EVERYONE' },
  });
  await prisma.user.upsert({
    where: { id: minor },
    update: { birthDate: yearsAgo(14), city: 'עיר בדיקה', gender: 'MALE' },
    create: { id: minor, name: 'Minor', birthDate: yearsAgo(14), city: 'עיר בדיקה', gender: 'MALE' },
  });
  await prisma.user.upsert({
    where: { id: outsider },
    update: { birthDate: yearsAgo(30) },
    create: { id: outsider, name: 'Outsider', birthDate: yearsAgo(30) },
  });
  await cleanup();
  const [userAId, userBId] = orderPair(adult, minor);
  await prisma.friendship.create({ data: { userAId, userBId } });
  await prisma.friendRequest.create({ data: { requesterId: outsider, receiverId: minor } });
});

afterAll(async () => {
  await cleanup();
  await prisma.user.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  await prisma.$disconnect();
});

const expectHidden = (u) => {
  expect(u).toBeTruthy();
  expect(u.city).toBeUndefined();
  expect(u.age).toBeUndefined();
  expect(u.gender).toBeUndefined();
};

describe("a minor's details in friends lists and requests", () => {
  test('a signed-out caller cannot read them from an adult friend list', async () => {
    const res = await request(app).get(`/api/users/${adult}/friends`);
    expect(res.statusCode).toEqual(200);
    expectHidden(res.body.find((u) => u.id === minor));
  });

  test('a signed-in non-friend cannot read them either', async () => {
    const res = await request(app).get(`/api/users/${adult}/friends`).set('Authorization', 'Bearer mock_token_outsider');
    expect(res.statusCode).toEqual(200);
    expectHidden(res.body.find((u) => u.id === minor));
  });

  test("the minor's confirmed friend still sees them", async () => {
    const res = await request(app).get(`/api/users/${adult}/friends`).set('Authorization', 'Bearer mock_token_adult');
    expect(res.statusCode).toEqual(200);
    const entry = res.body.find((u) => u.id === minor);
    expect(entry.city).toEqual('עיר בדיקה');
    expect(entry.age).toBeGreaterThanOrEqual(13);
  });

  test('a pending outgoing request to a minor does not reveal them', async () => {
    const res = await request(app).get(`/api/users/${outsider}/requests/outgoing`).set('Authorization', 'Bearer mock_token_outsider');
    expect(res.statusCode).toEqual(200);
    expectHidden(res.body.find((r) => r.receiver?.id === minor)?.receiver);
  });
});
