const request = require('supertest');

jest.setTimeout(30000);

// Covers the anonymous-facing users endpoints: the listing is signed-in only and bounded,
// the friends list honors privacyFriends, and GET /:id never creates rows for unknown ids.
jest.mock('../utils/auth', () => {
  const tokenMap = {
    mock_token_owner: { id: 'upe_test_owner', name: 'Owner', avatar: null },
    mock_token_friend: { id: 'upe_test_friend', name: 'Friend', avatar: null },
    mock_token_stranger: { id: 'upe_test_stranger', name: 'Stranger', avatar: null },
    mock_token_newbie: { id: 'upe_test_newbie', name: 'Newbie Person', avatar: null },
  };
  const userFor = (req) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    return token ? tokenMap[token] : undefined;
  };
  return {
    authenticateToken: (req, res, next) => {
      const user = userFor(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      req.user = user;
      return next();
    },
    attachOptionalUser: (req, res, next) => {
      const user = userFor(req);
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

describe('users public endpoints', () => {
  const owner = 'upe_test_owner';
  const friend = 'upe_test_friend';
  const stranger = 'upe_test_stranger';
  const newbie = 'upe_test_newbie';
  const unknownId = 'upe_test_unknown_never_created';
  const ownerAuth = 'Bearer mock_token_owner';
  const friendAuth = 'Bearer mock_token_friend';
  const strangerAuth = 'Bearer mock_token_stranger';
  const allIds = [owner, friend, stranger, newbie, unknownId];

  const cleanup = async () => {
    await prisma.friendship.deleteMany({ where: { OR: [{ userAId: { in: allIds } }, { userBId: { in: allIds } }] } });
    await prisma.user.deleteMany({ where: { id: { in: allIds } } }).catch(() => {});
  };

  beforeAll(async () => {
    await cleanup();
    for (const id of [owner, friend, stranger]) {
      await prisma.user.create({ data: { id, name: id } });
    }
    const [a, b] = owner < friend ? [owner, friend] : [friend, owner];
    await prisma.friendship.create({ data: { userAId: a, userBId: b } });
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('GET /api/users', () => {
    test('requires auth', async () => {
      const res = await request(app).get('/api/users');
      expect(res.statusCode).toEqual(401);
    });

    test('is bounded even without take, and caps take at 100', async () => {
      const def = await request(app).get('/api/users').set('Authorization', ownerAuth);
      expect(def.statusCode).toEqual(200);
      expect(def.body.length).toBeLessThanOrEqual(20);
      const big = await request(app).get('/api/users?take=5000').set('Authorization', ownerAuth);
      expect(big.statusCode).toEqual(200);
      expect(big.body.length).toBeLessThanOrEqual(100);
    });
  });

  describe('GET /api/users/:id/friends', () => {
    const setPrivacy = (privacyFriends) => prisma.user.update({ where: { id: owner }, data: { privacyFriends } });

    test('EVERYONE: visible anonymously', async () => {
      await setPrivacy('EVERYONE');
      const res = await request(app).get(`/api/users/${owner}/friends`);
      expect(res.statusCode).toEqual(200);
      expect(res.body.map((u) => u.id)).toEqual([friend]);
    });

    test('FRIENDS_ONLY: hidden from anonymous viewers and strangers', async () => {
      await setPrivacy('FRIENDS_ONLY');
      expect((await request(app).get(`/api/users/${owner}/friends`)).statusCode).toEqual(403);
      expect((await request(app).get(`/api/users/${owner}/friends`).set('Authorization', strangerAuth)).statusCode).toEqual(403);
    });

    test('FRIENDS_ONLY: visible to the owner and to confirmed friends', async () => {
      await setPrivacy('FRIENDS_ONLY');
      const own = await request(app).get(`/api/users/${owner}/friends`).set('Authorization', ownerAuth);
      expect(own.statusCode).toEqual(200);
      expect(own.body.map((u) => u.id)).toEqual([friend]);
      const fr = await request(app).get(`/api/users/${owner}/friends`).set('Authorization', friendAuth);
      expect(fr.statusCode).toEqual(200);
    });

    test('unset privacy on a minor defaults to FRIENDS_ONLY', async () => {
      const birthDate = new Date();
      birthDate.setFullYear(birthDate.getFullYear() - 15);
      await prisma.user.update({ where: { id: owner }, data: { privacyFriends: null, birthDate } });
      expect((await request(app).get(`/api/users/${owner}/friends`)).statusCode).toEqual(403);
      await prisma.user.update({ where: { id: owner }, data: { birthDate: null } });
    });
  });

  describe('GET /api/users/:id', () => {
    test('unknown id 404s and creates no row (anonymous and signed-in non-owner)', async () => {
      expect((await request(app).get(`/api/users/${unknownId}`)).statusCode).toEqual(404);
      expect((await request(app).get(`/api/users/${unknownId}`).set('Authorization', strangerAuth)).statusCode).toEqual(404);
      expect(await prisma.user.findUnique({ where: { id: unknownId } })).toBeNull();
    });

    test('the signed-in owner gets their own row created on first visit', async () => {
      const res = await request(app).get(`/api/users/${newbie}`).set('Authorization', 'Bearer mock_token_newbie');
      expect(res.statusCode).toEqual(200);
      expect(res.body.id).toEqual(newbie);
      expect(await prisma.user.findUnique({ where: { id: newbie } })).not.toBeNull();
    });
  });
});
