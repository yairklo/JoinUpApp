const request = require('supertest');

jest.setTimeout(30000);

jest.mock('../utils/auth', () => ({
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token !== 'mock_token_organizer') return res.status(401).json({ error: 'Unauthorized' });
    req.user = { id: 'cgts_test_org', name: 'Organizer', avatar: null };
    return next();
  },
  attachOptionalUser: (req, res, next) => next(),
}));

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

describe('convertGameToSeries pairs a ChatRoom with every auto-generated occurrence', () => {
  const orgId = 'cgts_test_org';
  const orgToken = 'mock_token_organizer';

  let testField;
  let originalGame;
  let seriesId;
  let createdGameIds = [];

  beforeAll(async () => {
    await prisma.user.upsert({ where: { id: orgId }, update: {}, create: { id: orgId, name: orgId, imageUrl: null } });

    testField = await prisma.field.create({
      data: {
        name: 'מגרש בדיקה - convert to series',
        location: 'רחוב הבדיקות 1',
        city: 'תל אביב',
        price: 0,
        rating: 5,
        available: false,
        type: 'OPEN',
      },
    });

    const createRes = await request(app)
      .post('/api/games')
      .set('Authorization', `Bearer ${orgToken}`)
      .send({
        title: 'משחק בדיקה - convert to series',
        maxPlayers: 2,
        fieldId: testField.id,
        start: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        duration: 1,
        sport: 'SOCCER',
        isOpenToJoin: true,
        joinPolicy: 'INSTANT',
      });
    expect(createRes.statusCode).toEqual(201);
    originalGame = createRes.body;
  });

  afterAll(async () => {
    try {
      const gameIds = [originalGame?.id, ...createdGameIds].filter(Boolean);
      if (gameIds.length) {
        await prisma.participation.deleteMany({ where: { gameId: { in: gameIds } } });
        await prisma.gameRole.deleteMany({ where: { gameId: { in: gameIds } } });
        await prisma.chatParticipant.deleteMany({ where: { chatId: { in: gameIds } } });
        await prisma.chatRoom.deleteMany({ where: { id: { in: gameIds } } });
        await prisma.game.deleteMany({ where: { id: { in: gameIds } } });
      }
      if (seriesId) {
        await prisma.seriesParticipant.deleteMany({ where: { seriesId } });
        await prisma.gameSeries.delete({ where: { id: seriesId } }).catch(() => {});
      }
      if (testField?.id) await prisma.field.delete({ where: { id: testField.id } });
    } catch (err) {
      console.warn('Clean up of convertGameToSeries test data skipped:', err.message);
    }
    await prisma.$disconnect();
  });

  test('converting a game to a series creates a paired ChatRoom for every generated occurrence', async () => {
    const res = await request(app)
      .post(`/api/games/${originalGame.id}/recurrence`)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ copyParticipants: false });

    expect(res.statusCode).toEqual(200);
    expect(res.body.created.length).toEqual(4);

    seriesId = res.body.seriesId;
    createdGameIds = res.body.created.map((g) => g.id);

    for (const gameId of createdGameIds) {
      const chatRoom = await prisma.chatRoom.findUnique({ where: { id: gameId } });
      expect(chatRoom).toBeTruthy();
      expect(chatRoom.type).toEqual('GROUP');

      const chatParticipant = await prisma.chatParticipant.findFirst({ where: { chatId: gameId, userId: orgId } });
      expect(chatParticipant).toBeTruthy();
    }
  });
});
