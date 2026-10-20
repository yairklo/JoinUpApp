/**
 * Game has a unique (seriesId, start). Every write path that can put two occurrences of one series
 * on the same slot must answer with a clean 4xx (or avoid the collision), never a 500 — and the
 * group-wide time edit must not leave the series row changed while its games were not.
 */
const request = require('supertest');

jest.setTimeout(60000);

jest.mock('../utils/auth', () => ({
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token !== 'mock_token_ssc_org') return res.status(401).json({ error: 'Unauthorized' });
    req.user = { id: 'ssc_test_org', name: 'SSC Organizer', avatar: null };
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

const { prisma, isSeriesSlotConflict } = require('../services/gameService');
const { parseJerusalemTimeToUTC, formatJerusalemDate } = require('../utils/timezone');
const { app } = require('../index');

describe('isSeriesSlotConflict', () => {
  test('matches the (seriesId, start) constraint as the pg adapter reports it', () => {
    expect(isSeriesSlotConflict({ code: 'P2002', meta: { target: ['"seriesId"', 'start'] } })).toBe(true);
    expect(isSeriesSlotConflict({ code: 'P2002', meta: { target: ['seriesId', 'start'] } })).toBe(true);
    expect(isSeriesSlotConflict({ code: 'P2002', meta: { target: 'Game_seriesId_start_key' } })).toBe(true);
  });

  test('ignores other unique violations and other errors', () => {
    expect(isSeriesSlotConflict({ code: 'P2002', meta: { target: ['id'] } })).toBe(false);
    expect(isSeriesSlotConflict({ code: 'P2025' })).toBe(false);
    expect(isSeriesSlotConflict(null)).toBe(false);
  });
});

describe('series slot conflicts on write paths', () => {
  const orgId = 'ssc_test_org';
  const auth = 'Bearer mock_token_ssc_org';
  const seriesIds = [];
  let field;
  let series;

  // Jerusalem-local HH:MM on the calendar day `days` from now.
  const slot = (days, hhmm) => parseJerusalemTimeToUTC(formatJerusalemDate(new Date(Date.now() + days * 86400000)), hhmm);

  const makeGame = (start, status = 'OPEN') =>
    prisma.game.create({
      data: { fieldId: field.id, seriesId: series.id, start, maxPlayers: 10, organizerId: orgId, status },
    });

  beforeAll(async () => {
    await prisma.user.upsert({ where: { id: orgId }, update: {}, create: { id: orgId, name: 'SSC Organizer' } });
    field = await prisma.field.create({ data: { name: 'SSC Test Field', location: 'Test', type: 'OPEN' } });
    series = await prisma.gameSeries.create({
      data: {
        organizerId: orgId,
        fieldId: field.id,
        fieldName: field.name,
        fieldLocation: field.location,
        maxPlayers: 10,
        dayOfWeek: 2,
        time: '20:00',
        duration: 1,
        type: 'WEEKLY',
      },
    });
    seriesIds.push(series.id);
  });

  afterAll(async () => {
    try {
      const ids = (await prisma.game.findMany({ where: { seriesId: { in: seriesIds } }, select: { id: true } })).map((g) => g.id);
      if (ids.length) {
        await prisma.participation.deleteMany({ where: { gameId: { in: ids } } });
        await prisma.gameRole.deleteMany({ where: { gameId: { in: ids } } });
        await prisma.chatParticipant.deleteMany({ where: { chatId: { in: ids } } });
        await prisma.chatRoom.deleteMany({ where: { id: { in: ids } } });
        await prisma.game.deleteMany({ where: { id: { in: ids } } });
      }
      await prisma.seriesParticipant.deleteMany({ where: { seriesId: { in: seriesIds } } });
      await prisma.gameSeries.deleteMany({ where: { id: { in: seriesIds } } });
      if (field) await prisma.field.delete({ where: { id: field.id } });
      await prisma.user.deleteMany({ where: { id: orgId } });
    } catch (e) {
      console.warn('series slot conflict test cleanup skipped:', e.message);
    }
    await prisma.$disconnect();
  });

  test('PATCH /api/games/:id onto another occurrence slot is a 409 and changes nothing', async () => {
    const a = await makeGame(slot(10, '20:00'));
    const b = await makeGame(slot(17, '20:00'));
    const res = await request(app).patch(`/api/games/${b.id}`).set('Authorization', auth).send({ start: a.start.toISOString() });
    expect(res.statusCode).toBe(409);
    const after = await prisma.game.findUnique({ where: { id: b.id }, select: { start: true } });
    expect(after.start.toISOString()).toBe(b.start.toISOString());
  });

  test('a series time change that lands on a cancelled occurrence is a 409 and changes nothing', async () => {
    // Day 24: the 20:00 occurrence stays OPEN, a 21:00 one on the same day was cancelled.
    const open = await makeGame(slot(24, '20:00'));
    await makeGame(slot(24, '21:00'), 'CANCELLED');

    const res = await request(app)
      .patch(`/api/series/${series.id}`)
      .set('Authorization', auth)
      .send({ time: '21:00', updateFutureGames: true });

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('SERIES_SLOT_TAKEN');
    // Neither the series row nor its games moved.
    expect((await prisma.gameSeries.findUnique({ where: { id: series.id } })).time).toBe('20:00');
    const openAfter = await prisma.game.findUnique({ where: { id: open.id }, select: { start: true } });
    expect(openAfter.start.toISOString()).toBe(open.start.toISOString());
  });

  test('a CUSTOM series with the same date twice creates that occurrence once', async () => {
    const when = slot(31, '19:00').toISOString();
    const res = await request(app)
      .post('/api/games')
      .set('Authorization', auth)
      .send({
        title: 'SSC custom dup',
        maxPlayers: 10,
        fieldId: field.id,
        start: when,
        duration: 1,
        recurrence: { type: 'CUSTOM', dates: [when, when] },
      });
    expect(res.statusCode).toBe(201);
    expect(res.body.seriesId).toBeTruthy();
    seriesIds.push(res.body.seriesId);
    expect(await prisma.game.count({ where: { seriesId: res.body.seriesId } })).toBe(1);
  });
});
