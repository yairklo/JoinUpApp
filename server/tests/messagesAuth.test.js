const request = require('supertest');

jest.mock('../utils/auth', () => ({
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    if (token === 'mock_token_organizer') {
      req.user = { id: 'user_org_123', name: 'Organizer' };
    } else if (token === 'mock_token_player1') {
      req.user = { id: 'user_play_1', name: 'Player 1' };
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

describe('Message write auth', () => {
  const roomId = `test_chat_${Date.now()}`;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.upsert({
      where: { id: 'user_org_123' },
      update: {},
      create: { id: 'user_org_123', name: 'Organizer' },
    });
    await prisma.user.upsert({
      where: { id: 'user_play_1' },
      update: {},
      create: { id: 'user_play_1', name: 'Player 1' },
    });
    await prisma.chatRoom.create({
      data: {
        id: roomId,
        type: 'PRIVATE',
        participants: { create: [{ userId: 'user_org_123' }] },
      },
    });
  });

  afterAll(async () => {
    await prisma.message.deleteMany({ where: { chatRoomId: roomId } });
    await prisma.chatParticipant.deleteMany({ where: { chatId: roomId } });
    await prisma.chatRoom.deleteMany({ where: { id: roomId } });
    await prisma.$disconnect();
  });

  test('POST /api/messages without token is 401', async () => {
    const res = await request(app)
      .post('/api/messages')
      .send({ roomId, text: 'hello' });
    expect(res.statusCode).toEqual(401);
  });

  test('POST /api/messages as non-participant is 403', async () => {
    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', 'Bearer mock_token_player1')
      .send({ roomId, text: 'hello' });
    expect(res.statusCode).toEqual(403);
  });

  test('POST /api/messages as participant succeeds and binds userId', async () => {
    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', 'Bearer mock_token_organizer')
      .send({ roomId, text: 'hello from organizer', userId: 'user_play_1' });
    expect(res.statusCode).toEqual(201);
    expect(res.body.userId).toEqual('user_org_123');
    expect(res.body.text).toEqual('hello from organizer');
  });

  test('legacy /api/auth is unmounted', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'a@b.c', password: 'x' });
    expect(res.statusCode).toEqual(404);
  });
});
