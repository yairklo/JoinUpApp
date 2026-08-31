const request = require('supertest');

jest.setTimeout(30000);

jest.mock('../utils/auth', () => ({
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    if (token === 'mock_token_requester') {
      req.user = { id: 'user_fr_requester', name: 'Requester' };
    } else if (token === 'mock_token_receiver') {
      req.user = { id: 'user_fr_receiver', name: 'Receiver' };
    } else if (token === 'mock_token_stranger') {
      req.user = { id: 'user_fr_stranger', name: 'Stranger' };
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

const { prisma } = require('../services/gameService');
const { app } = require('../index');

describe('POST /api/users/requests/:id/cancel', () => {
  let requestId;

  beforeAll(async () => {
    await prisma.$connect();
    await Promise.all(
      ['user_fr_requester', 'user_fr_receiver', 'user_fr_stranger'].map((id) =>
        prisma.user.upsert({ where: { id }, update: {}, create: { id, name: id } })
      )
    );
  });

  beforeEach(async () => {
    await prisma.friendRequest.deleteMany({
      where: { requesterId: 'user_fr_requester', receiverId: 'user_fr_receiver' },
    });
    const row = await prisma.friendRequest.create({
      data: { requesterId: 'user_fr_requester', receiverId: 'user_fr_receiver' },
    });
    requestId = row.id;
  });

  afterAll(async () => {
    await prisma.friendRequest.deleteMany({ where: { requesterId: 'user_fr_requester' } });
    await prisma.user.deleteMany({
      where: { id: { in: ['user_fr_requester', 'user_fr_receiver', 'user_fr_stranger'] } },
    });
    await prisma.$disconnect();
  });

  test('requester can cancel their own pending request', async () => {
    const res = await request(app)
      .post(`/api/users/requests/${requestId}/cancel`)
      .set('Authorization', 'Bearer mock_token_requester');
    expect(res.status).toBe(200);

    const row = await prisma.friendRequest.findUnique({ where: { id: requestId } });
    expect(row).toBeNull();
  });

  test('a user who is not the requester cannot cancel it', async () => {
    const res = await request(app)
      .post(`/api/users/requests/${requestId}/cancel`)
      .set('Authorization', 'Bearer mock_token_stranger');
    expect(res.status).toBe(404);

    const row = await prisma.friendRequest.findUnique({ where: { id: requestId } });
    expect(row).not.toBeNull();
  });

  test('the receiver cannot cancel it via this endpoint (that is decline)', async () => {
    const res = await request(app)
      .post(`/api/users/requests/${requestId}/cancel`)
      .set('Authorization', 'Bearer mock_token_receiver');
    expect(res.status).toBe(404);
  });
});
