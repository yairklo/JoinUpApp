const request = require('supertest');

jest.setTimeout(30000);

jest.mock('../utils/auth', () => ({
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const users = {
      mock_token_sender: { id: 'report_sender', name: 'Sender' },
      mock_token_reporter: { id: 'report_reporter', name: 'Reporter' },
      mock_token_outsider: { id: 'report_outsider', name: 'Outsider' },
    };
    if (!users[token]) return res.status(403).json({ error: 'Invalid token' });
    req.user = users[token];
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

describe('POST /api/messages/:id/report', () => {
  const roomId = `test_report_chat_${Date.now()}`;
  const userIds = ['report_sender', 'report_reporter', 'report_outsider'];
  let messageId;
  let ownMessageId;

  beforeAll(async () => {
    await prisma.$connect();
    for (const id of userIds) {
      await prisma.user.upsert({ where: { id }, update: {}, create: { id, name: id } });
    }
    await prisma.chatRoom.create({
      data: {
        id: roomId,
        type: 'GROUP',
        participants: { create: [{ userId: 'report_sender' }, { userId: 'report_reporter' }] },
      },
    });
    const msg = await prisma.message.create({
      data: { chatRoomId: roomId, text: 'something nasty', userId: 'report_sender' },
    });
    messageId = msg.id;
    const own = await prisma.message.create({
      data: { chatRoomId: roomId, text: 'my own message', userId: 'report_reporter' },
    });
    ownMessageId = own.id;
  });

  afterAll(async () => {
    try {
      await prisma.flaggedMessage.deleteMany({ where: { messageId: { in: [messageId, ownMessageId] } } });
      await prisma.message.deleteMany({ where: { chatRoomId: roomId } });
      await prisma.chatParticipant.deleteMany({ where: { chatId: roomId } });
      await prisma.chatRoom.deleteMany({ where: { id: roomId } });
    } catch (err) {
      console.warn('messageReport cleanup skipped:', err.message);
    }
  });

  test('without token is 401', async () => {
    const res = await request(app).post(`/api/messages/${messageId}/report`).send({ reason: 'OFFENSIVE' });
    expect(res.statusCode).toEqual(401);
  });

  test('non-participant is 403', async () => {
    const res = await request(app)
      .post(`/api/messages/${messageId}/report`)
      .set('Authorization', 'Bearer mock_token_outsider')
      .send({ reason: 'OFFENSIVE' });
    expect(res.statusCode).toEqual(403);
  });

  test('unknown message is 404', async () => {
    const res = await request(app)
      .post('/api/messages/does_not_exist/report')
      .set('Authorization', 'Bearer mock_token_reporter')
      .send({ reason: 'OFFENSIVE' });
    expect(res.statusCode).toEqual(404);
  });

  test('reporting your own message is 400', async () => {
    const res = await request(app)
      .post(`/api/messages/${ownMessageId}/report`)
      .set('Authorization', 'Bearer mock_token_reporter')
      .send({ reason: 'OFFENSIVE' });
    expect(res.statusCode).toEqual(400);
  });

  test('participant report lands in the moderation queue, attributed to the sender', async () => {
    const res = await request(app)
      .post(`/api/messages/${messageId}/report`)
      .set('Authorization', 'Bearer mock_token_reporter')
      .send({ reason: 'harassment', details: 'keeps doing this' });
    expect(res.statusCode).toEqual(201);

    const rows = await prisma.flaggedMessage.findMany({ where: { messageId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toEqual('report_sender');
    expect(rows[0].content).toEqual('something nasty');
    expect(rows[0].status).toEqual('PENDING_REVIEW');
    expect(rows[0].aiTriggers).toMatchObject({
      source: 'user_report',
      reason: 'HARASSMENT',
      details: 'keeps doing this',
      reporterId: 'report_reporter',
      roomId,
    });
  });

  test('repeat report by the same user does not duplicate the queue entry', async () => {
    const res = await request(app)
      .post(`/api/messages/${messageId}/report`)
      .set('Authorization', 'Bearer mock_token_reporter')
      .send({ reason: 'SPAM' });
    expect(res.statusCode).toEqual(200);
    expect(res.body.alreadyReported).toBe(true);
    expect(await prisma.flaggedMessage.count({ where: { messageId } })).toEqual(1);
  });
});
