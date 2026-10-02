const request = require('supertest');

jest.setTimeout(60000);

jest.mock('../utils/auth', () => ({
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token !== 'mock_token_organizer') return res.status(401).json({ error: 'Unauthorized' });
    req.user = { id: 'sdv_test_org', name: 'Organizer', avatar: null };
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

describe('Series delete strategies and free-text venue change', () => {
  const orgId = 'sdv_test_org';
  const auth = 'Bearer mock_token_organizer';
  const day = 24 * 60 * 60 * 1000;

  let field;
  const seriesIds = [];
  const gameIds = [];
  const createdFieldIds = [];

  const makeSeries = async () => {
    const series = await prisma.gameSeries.create({
      data: {
        organizerId: orgId,
        fieldId: field.id,
        fieldName: field.name,
        fieldLocation: field.location,
        maxPlayers: 10,
        time: '20:00',
        duration: 1,
        dayOfWeek: 2,
        type: 'WEEKLY',
        title: 'סדרה לבדיקה - delete/venue',
      },
    });
    seriesIds.push(series.id);
    return series;
  };

  const makeGame = async (seriesId, daysAhead, status = 'OPEN') => {
    const game = await prisma.game.create({
      data: {
        fieldId: field.id,
        start: new Date(Date.now() + daysAhead * day),
        maxPlayers: 10,
        organizerId: orgId,
        seriesId,
        status,
      },
    });
    gameIds.push(game.id);
    return game;
  };

  beforeAll(async () => {
    await prisma.user.upsert({ where: { id: orgId }, update: {}, create: { id: orgId, name: orgId, imageUrl: null } });
    field = await prisma.field.create({
      data: {
        name: 'מגרש בדיקה - delete/venue',
        location: 'רחוב הבדיקות 3',
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
      if (gameIds.length) {
        await prisma.participation.deleteMany({ where: { gameId: { in: gameIds } } });
        await prisma.game.deleteMany({ where: { id: { in: gameIds } } });
      }
      if (seriesIds.length) {
        await prisma.seriesParticipant.deleteMany({ where: { seriesId: { in: seriesIds } } });
        await prisma.gameSeries.deleteMany({ where: { id: { in: seriesIds } } });
      }
      const fieldIds = [field?.id, ...createdFieldIds].filter(Boolean);
      if (fieldIds.length) await prisma.field.deleteMany({ where: { id: { in: fieldIds } } });
    } catch (err) {
      console.warn('Clean up of series delete/venue test data skipped:', err.message);
    }
    await prisma.$disconnect();
  });

  test('SELECTIVE delete removes the chosen and the (unlistable) cancelled games, and detaches the rest', async () => {
    const series = await makeSeries();
    const chosen = await makeGame(series.id, 3);
    const kept = await makeGame(series.id, 10);
    const cancelled = await makeGame(series.id, 17, 'CANCELLED');

    const res = await request(app)
      .post(`/api/series/${series.id}/delete`)
      .set('Authorization', auth)
      .send({ strategy: 'SELECTIVE', gameIdsToDelete: [chosen.id] });
    expect(res.statusCode).toEqual(200);

    expect(await prisma.game.findUnique({ where: { id: chosen.id } })).toBeNull();
    expect(await prisma.game.findUnique({ where: { id: cancelled.id } })).toBeNull();
    const survivor = await prisma.game.findUnique({ where: { id: kept.id } });
    expect(survivor).not.toBeNull();
    expect(survivor.seriesId).toBeNull();
    expect(await prisma.gameSeries.findUnique({ where: { id: series.id } })).toBeNull();
  });

  test('KEEP_GAMES detaches every future game, including cancelled ones', async () => {
    const series = await makeSeries();
    const open = await makeGame(series.id, 4);
    const cancelled = await makeGame(series.id, 11, 'CANCELLED');

    const res = await request(app)
      .post(`/api/series/${series.id}/delete`)
      .set('Authorization', auth)
      .send({ strategy: 'KEEP_GAMES' });
    expect(res.statusCode).toEqual(200);

    expect((await prisma.game.findUnique({ where: { id: open.id } })).seriesId).toBeNull();
    expect((await prisma.game.findUnique({ where: { id: cancelled.id } })).seriesId).toBeNull();
  });

  test('a free-text venue becomes an unlisted Field that the series and its open future games point at', async () => {
    const series = await makeSeries();
    const open = await makeGame(series.id, 5);
    const cancelled = await makeGame(series.id, 12, 'CANCELLED');

    const res = await request(app)
      .patch(`/api/series/${series.id}`)
      .set('Authorization', auth)
      .send({ fieldId: null, fieldName: 'מגרש חופשי חדש', fieldLocation: 'הרצל 1, חיפה', updateFutureGames: true });
    expect(res.statusCode).toEqual(200);

    const updated = await prisma.gameSeries.findUnique({ where: { id: series.id } });
    expect(updated.fieldId).toBeTruthy();
    expect(updated.fieldId).not.toEqual(field.id);
    createdFieldIds.push(updated.fieldId);

    const created = await prisma.field.findUnique({ where: { id: updated.fieldId } });
    expect(created).toMatchObject({ name: 'מגרש חופשי חדש', location: 'הרצל 1, חיפה', available: false });

    expect((await prisma.game.findUnique({ where: { id: open.id } })).fieldId).toEqual(updated.fieldId);
    // A cancelled game stays closed and untouched.
    expect((await prisma.game.findUnique({ where: { id: cancelled.id } })).fieldId).toEqual(field.id);
  });

  test('picking an existing field creates no new Field', async () => {
    const series = await makeSeries();
    const before = await prisma.field.count();

    const res = await request(app)
      .patch(`/api/series/${series.id}`)
      .set('Authorization', auth)
      .send({ fieldId: field.id, fieldName: field.name, fieldLocation: field.location, updateFutureGames: false });
    expect(res.statusCode).toEqual(200);
    expect(await prisma.field.count()).toEqual(before);
  });
});
