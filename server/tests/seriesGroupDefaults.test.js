const request = require('supertest');

jest.setTimeout(60000);

jest.mock('../utils/auth', () => ({
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    const tokenMap = {
      mock_token_organizer: { id: 'sgd_test_org', name: 'Organizer', avatar: null },
      mock_token_admin: { id: 'sgd_test_admin', name: 'Admin', avatar: null, isAdmin: true },
    };
    if (!token || !tokenMap[token]) return res.status(401).json({ error: 'Unauthorized' });
    req.user = tokenMap[token];
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
const { formatJerusalemTime } = require('../utils/timezone');
const { app } = require('../index');

describe('Group (series) default settings', () => {
  const orgId = 'sgd_test_org';
  const adminId = 'sgd_test_admin';
  const orgAuth = 'Bearer mock_token_organizer';
  const adminAuth = 'Bearer mock_token_admin';

  let field;
  const seriesIds = [];
  const gameIds = [];

  const startIn = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  beforeAll(async () => {
    for (const id of [orgId, adminId]) {
      await prisma.user.upsert({ where: { id }, update: {}, create: { id, name: id, imageUrl: null } });
    }
    field = await prisma.field.create({
      data: {
        name: 'מגרש בדיקה - group defaults',
        location: 'רחוב הבדיקות 2',
        city: 'תל אביב',
        price: 0,
        rating: 5,
        available: false,
        type: 'OPEN',
      },
    });
  });

  afterAll(async () => {
    try {
      const games = await prisma.game.findMany({ where: { seriesId: { in: seriesIds } }, select: { id: true } });
      const ids = Array.from(new Set([...gameIds, ...games.map((g) => g.id)]));
      if (ids.length) {
        await prisma.participation.deleteMany({ where: { gameId: { in: ids } } });
        await prisma.gameRole.deleteMany({ where: { gameId: { in: ids } } });
        await prisma.chatParticipant.deleteMany({ where: { chatId: { in: ids } } });
        await prisma.chatRoom.deleteMany({ where: { id: { in: ids } } });
        await prisma.game.deleteMany({ where: { id: { in: ids } } });
      }
      if (seriesIds.length) {
        await prisma.seriesParticipant.deleteMany({ where: { seriesId: { in: seriesIds } } });
        await prisma.gameSeries.deleteMany({ where: { id: { in: seriesIds } } });
      }
      if (field?.id) await prisma.field.delete({ where: { id: field.id } });
    } catch (err) {
      console.warn('Clean up of group defaults test data skipped:', err.message);
    }
    await prisma.$disconnect();
  });

  describe('creating a recurring game', () => {
    let seriesId;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/games')
        .set('Authorization', orgAuth)
        .send({
          title: 'משחק בדיקה - group defaults',
          maxPlayers: 12,
          price: 30,
          fieldId: field.id,
          start: startIn(2),
          duration: 1,
          sport: 'BASKETBALL',
          isOpenToJoin: false,
          isFriendsOnly: true,
          joinPolicy: 'REQUIRES_APPROVAL',
          lotteryEnabled: true,
          lotteryAt: startIn(1),
          organizerInLottery: true,
          teamSize: 5,
          welcomeMessage: 'ברוכים הבאים',
          recurrence: { type: 'WEEKLY' },
        });
      expect(res.statusCode).toEqual(201);
      seriesId = res.body.seriesId;
      expect(seriesId).toBeTruthy();
      seriesIds.push(seriesId);
    });

    test('persists the game settings on the new series and adds the organizer as MANAGER', async () => {
      const series = await prisma.gameSeries.findUnique({ where: { id: seriesId } });
      expect(series).toMatchObject({
        maxPlayers: 12,
        price: 30,
        sport: 'BASKETBALL',
        isOpenToJoin: false,
        isFriendsOnly: true,
        joinPolicy: 'REQUIRES_APPROVAL',
        lotteryEnabled: true,
        organizerInLottery: true,
        teamSize: 5,
        welcomeMessage: 'ברוכים הבאים',
      });

      const member = await prisma.seriesParticipant.findUnique({
        where: { seriesId_userId: { seriesId, userId: orgId } },
      });
      expect(member?.role).toEqual('MANAGER');
    });

    test('GET /api/series/:id exposes the group defaults', async () => {
      const res = await request(app).get(`/api/series/${seriesId}`);
      expect(res.statusCode).toEqual(200);
      expect(res.body).toMatchObject({
        maxPlayers: 12,
        price: 30,
        sport: 'BASKETBALL',
        isOpenToJoin: false,
        isFriendsOnly: true,
        joinPolicy: 'REQUIRES_APPROVAL',
        lotteryEnabled: true,
        organizerInLottery: true,
        teamSize: 5,
        welcomeMessage: 'ברוכים הבאים',
      });
    });

    test('GET /api/series/:id returns each upcoming game with its Jerusalem start time', async () => {
      const res = await request(app).get(`/api/series/${seriesId}`);
      expect(res.statusCode).toEqual(200);
      expect(res.body.upcomingGames.length).toBeGreaterThan(0);
      for (const g of res.body.upcomingGames) {
        expect(g.time).toEqual(formatJerusalemTime(g.date));
        expect(g.time).toMatch(/^[0-9]{2}:[0-9]{2}$/);
      }
    });

    test('a game created for the group inherits the defaults it does not override', async () => {
      const res = await request(app)
        .post('/api/games')
        .set('Authorization', orgAuth)
        .send({
          seriesId,
          fieldId: field.id,
          start: startIn(30),
          maxPlayers: 12,
        });
      expect(res.statusCode).toEqual(201);
      gameIds.push(res.body.id);
      const game = await prisma.game.findUnique({ where: { id: res.body.id } });
      expect(game).toMatchObject({
        sport: 'BASKETBALL',
        isFriendsOnly: true,
        joinPolicy: 'REQUIRES_APPROVAL',
        lotteryEnabled: true,
        organizerInLottery: true,
        teamSize: 5,
        welcomeMessage: 'ברוכים הבאים',
      });
    });

    describe('PATCH /api/series/:id', () => {
      const patch = (body) =>
        request(app).patch(`/api/series/${seriesId}`).set('Authorization', orgAuth).send(body);

      test('rejects maxPlayers below 2 without touching the series or its games', async () => {
        for (const bad of [0, 1, -3, 2.5, 'abc']) {
          const res = await patch({ maxPlayers: bad });
          expect(res.statusCode).toEqual(400);
        }
        const series = await prisma.gameSeries.findUnique({ where: { id: seriesId } });
        expect(series.maxPlayers).toEqual(12);
      });

      test('rejects an unknown sport with 400 instead of a 500', async () => {
        const res = await patch({ sport: 'CHESS' });
        expect(res.statusCode).toEqual(400);
      });

      test('rejects a non-positive teamSize', async () => {
        const res = await patch({ teamSize: 0 });
        expect(res.statusCode).toEqual(400);
      });

      test('sanitizes and caps welcomeMessage, and stores blank as null', async () => {
        let res = await patch({ welcomeMessage: '<script>alert(1)</script>שלום', updateFutureGames: false });
        expect(res.statusCode).toEqual(200);
        expect(res.body.series.welcomeMessage).not.toMatch(/<script/i);
        expect(res.body.series.welcomeMessage).toContain('שלום');

        res = await patch({ welcomeMessage: 'x'.repeat(5000), updateFutureGames: false });
        expect(res.statusCode).toEqual(200);
        expect(res.body.series.welcomeMessage.length).toBeLessThanOrEqual(2000);

        res = await patch({ welcomeMessage: '   ', updateFutureGames: false });
        expect(res.statusCode).toEqual(200);
        expect(res.body.series.welcomeMessage).toBeNull();
      });

      test('propagates price and only the fields sent to future games', async () => {
        const [target] = await prisma.game.findMany({
          where: { seriesId, start: { gte: new Date() } },
          orderBy: { start: 'asc' },
        });
        // A per-game customization that an unrelated series edit must not clobber.
        await prisma.game.update({ where: { id: target.id }, data: { isOpenToJoin: true } });

        const res = await patch({ price: 45, welcomeMessage: 'הודעה חדשה' });
        expect(res.statusCode).toEqual(200);

        const games = await prisma.game.findMany({ where: { seriesId, start: { gte: new Date() } } });
        expect(games.length).toBeGreaterThan(0);
        for (const g of games) {
          expect(g.price).toEqual(45);
          expect(g.welcomeMessage).toEqual('הודעה חדשה');
        }
        const after = games.find((g) => g.id === target.id);
        expect(after.isOpenToJoin).toEqual(true);
        expect(after.maxPlayers).toEqual(12);
      });

      test('a price of 0 is stored as null on games, like createGame does', async () => {
        const res = await patch({ price: 0 });
        expect(res.statusCode).toEqual(200);
        const games = await prisma.game.findMany({ where: { seriesId, start: { gte: new Date() } } });
        for (const g of games) expect(g.price).toBeNull();
      });
    });
  });

  describe('convertGameToSeries', () => {
    test('persists the game settings and makes the organizer (not the admin caller) a MANAGER', async () => {
      const createRes = await request(app)
        .post('/api/games')
        .set('Authorization', orgAuth)
        .send({
          title: 'משחק בדיקה - convert defaults',
          maxPlayers: 8,
          fieldId: field.id,
          start: startIn(3),
          duration: 1,
          sport: 'SOCCER',
          isFriendsOnly: true,
          joinPolicy: 'REQUIRES_APPROVAL',
          welcomeMessage: 'היי',
        });
      expect(createRes.statusCode).toEqual(201);
      gameIds.push(createRes.body.id);

      const res = await request(app)
        .post(`/api/games/${createRes.body.id}/recurrence`)
        .set('Authorization', adminAuth)
        .send({ copyParticipants: false });
      expect(res.statusCode).toEqual(200);
      const seriesId = res.body.seriesId;
      seriesIds.push(seriesId);

      const series = await prisma.gameSeries.findUnique({ where: { id: seriesId } });
      expect(series).toMatchObject({
        isFriendsOnly: true,
        joinPolicy: 'REQUIRES_APPROVAL',
        welcomeMessage: 'היי',
      });

      const members = await prisma.seriesParticipant.findMany({ where: { seriesId } });
      expect(members.map((m) => m.userId)).toEqual([orgId]);
      expect(members[0].role).toEqual('MANAGER');

      const generated = await prisma.game.findMany({ where: { seriesId, id: { not: createRes.body.id } } });
      expect(generated.length).toEqual(4);
      for (const g of generated) {
        expect(g.joinPolicy).toEqual('REQUIRES_APPROVAL');
        expect(g.welcomeMessage).toEqual('היי');
      }
    });
  });
});
