const request = require('supertest');

jest.setTimeout(30000);

jest.mock('../utils/auth', () => ({
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    if (token === 'mock_token_rmf_a') {
      req.user = { id: 'user_rmf_a', name: 'Ada' };
    } else if (token === 'mock_token_rmf_b') {
      req.user = { id: 'user_rmf_b', name: 'Bea' };
    } else if (token === 'mock_token_rmf_c') {
      req.user = { id: 'user_rmf_c', name: 'Cid' };
    } else {
      return res.status(403).json({ error: 'Invalid token' });
    }
    return next();
  },
  attachOptionalUser: (_req, _res, next) => next(),
}));

jest.mock('../workers/reviewWorker', () => ({
  processReviewQueue: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../workers/cleanupWorker', () => ({
  startCleanupWorker: jest.fn(),
}));

const { prisma } = require('../lib/prisma');
const { app } = require('../index');

const IDS = ['user_rmf_a', 'user_rmf_b', 'user_rmf_c'];
const authA = 'Bearer mock_token_rmf_a';
const authC = 'Bearer mock_token_rmf_c';

describe('DELETE /api/users/:id/friends/:friendId', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await Promise.all(
      IDS.map((id) => prisma.user.upsert({ where: { id }, update: {}, create: { id, name: id } }))
    );
  });

  beforeEach(async () => {
    await prisma.friendship.deleteMany({
      where: { OR: [{ userAId: { in: IDS } }, { userBId: { in: IDS } }] },
    });
  });

  afterAll(async () => {
    await prisma.friendship.deleteMany({
      where: { OR: [{ userAId: { in: IDS } }, { userBId: { in: IDS } }] },
    });
    await prisma.user.deleteMany({ where: { id: { in: IDS } } });
    await prisma.$disconnect();
  });

  test('returns 404 when the two users are not friends', async () => {
    const res = await request(app)
      .delete('/api/users/user_rmf_a/friends/user_rmf_b')
      .set('Authorization', authA);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not friends' });
  });

  test('removes an existing friendship', async () => {
    await prisma.friendship.create({ data: { userAId: 'user_rmf_a', userBId: 'user_rmf_b' } });

    const res = await request(app)
      .delete('/api/users/user_rmf_a/friends/user_rmf_b')
      .set('Authorization', authA);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const row = await prisma.friendship.findFirst({
      where: { userAId: 'user_rmf_a', userBId: 'user_rmf_b' },
    });
    expect(row).toBeNull();
  });

  test('a second delete of the same pair is 404', async () => {
    await prisma.friendship.create({ data: { userAId: 'user_rmf_a', userBId: 'user_rmf_b' } });
    const first = await request(app)
      .delete('/api/users/user_rmf_b/friends/user_rmf_a')
      .set('Authorization', 'Bearer mock_token_rmf_b');
    expect(first.status).toBe(200);

    const second = await request(app)
      .delete('/api/users/user_rmf_a/friends/user_rmf_b')
      .set('Authorization', authA);
    expect(second.status).toBe(404);
    expect(second.body.error).toBe('Not friends');
  });

  test('still rejects removing someone else\'s friend', async () => {
    await prisma.friendship.create({ data: { userAId: 'user_rmf_a', userBId: 'user_rmf_b' } });

    const res = await request(app)
      .delete('/api/users/user_rmf_a/friends/user_rmf_b')
      .set('Authorization', authC);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Access denied');
    const row = await prisma.friendship.findFirst({
      where: { userAId: 'user_rmf_a', userBId: 'user_rmf_b' },
    });
    expect(row).not.toBeNull();
  });
});
