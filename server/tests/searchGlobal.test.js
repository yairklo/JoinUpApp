const request = require('supertest');

jest.setTimeout(30000);

jest.mock('../utils/auth', () => ({
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    if (token === 'mock_token_searchpilot') {
      req.user = { id: 'user_searchpilot_self', name: 'SearchPilotSelf', isAdmin: false };
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

describe('GET /api/search/global', () => {
  const selfId = 'user_searchpilot_self';
  const matchId = 'user_searchpilot_match';
  let fieldId;
  let gameId;

  beforeAll(async () => {
    await prisma.$connect();

    await prisma.user.upsert({
      where: { id: selfId },
      update: { name: 'SearchPilotSelf' },
      create: { id: selfId, name: 'SearchPilotSelf' },
    });
    await prisma.user.upsert({
      where: { id: matchId },
      update: { name: 'SearchPilotMatch' },
      create: { id: matchId, name: 'SearchPilotMatch' },
    });

    const field = await prisma.field.create({
      data: {
        name: 'SearchPilotField',
        location: 'SearchPilotField address',
        city: 'SearchPilotCity',
        type: 'OPEN',
        available: true,
      },
    });
    fieldId = field.id;

    const game = await prisma.game.create({
      data: {
        title: 'SearchPilotGame',
        fieldId,
        organizerId: matchId,
        start: new Date(Date.now() + 60 * 60 * 1000), // 1h from now — clears the active-game cutoff
        maxPlayers: 10,
      },
    });
    gameId = game.id;
  });

  afterAll(async () => {
    try {
      if (gameId) await prisma.game.deleteMany({ where: { id: gameId } });
      if (fieldId) await prisma.field.deleteMany({ where: { id: fieldId } });
      await prisma.user.deleteMany({ where: { id: { in: [selfId, matchId] } } });
    } catch (err) {
      console.warn('searchGlobal cleanup skipped:', err.message);
    }
  });

  test('rejects unauthenticated requests (00-core-invariants: auth required)', async () => {
    const res = await request(app).get('/api/search/global').query({ q: 'searchpilot' });
    expect(res.statusCode).toEqual(401);
  });

  test('query shorter than 2 chars short-circuits without hitting the DB', async () => {
    const userSpy = jest.spyOn(prisma.user, 'findMany');
    const fieldSpy = jest.spyOn(prisma.field, 'findMany');
    const gameSpy = jest.spyOn(prisma.game, 'findMany');

    const res = await request(app)
      .get('/api/search/global')
      .set('Authorization', 'Bearer mock_token_searchpilot')
      .query({ q: 'a' });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ users: [], fields: [], games: [] });
    expect(userSpy).not.toHaveBeenCalled();
    expect(fieldSpy).not.toHaveBeenCalled();
    expect(gameSpy).not.toHaveBeenCalled();

    userSpy.mockRestore();
    fieldSpy.mockRestore();
    gameSpy.mockRestore();
  });

  test('matches users/fields/games and excludes the requesting user', async () => {
    const res = await request(app)
      .get('/api/search/global')
      .set('Authorization', 'Bearer mock_token_searchpilot')
      .query({ q: 'searchpilot' });

    expect(res.statusCode).toEqual(200);

    const userIds = res.body.users.map((u) => u.id);
    expect(userIds).toContain(matchId);
    expect(userIds).not.toContain(selfId); // loggedInUserId excluded

    expect(res.body.fields.some((f) => f.id === fieldId)).toBe(true);
    expect(res.body.games.some((g) => g.id === gameId)).toBe(true);
  });

  test('a Prisma failure returns 500 without leaking the raw error', async () => {
    const gameSpy = jest
      .spyOn(prisma.game, 'findMany')
      .mockRejectedValueOnce(new Error('connection reset by peer'));

    const res = await request(app)
      .get('/api/search/global')
      .set('Authorization', 'Bearer mock_token_searchpilot')
      .query({ q: 'searchpilot' });

    expect(res.statusCode).toEqual(500);
    expect(res.body).toEqual({ error: 'Global search failed' });
    expect(JSON.stringify(res.body)).not.toMatch(/connection reset/);

    gameSpy.mockRestore();
  });
});
