const request = require('supertest');

jest.setTimeout(30000);

jest.mock('../utils/auth', () => ({
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    const tokenMap = {
      mock_token_organizer: { id: 'srr_org', name: 'Organizer' },
      mock_token_stranger: { id: 'srr_stranger', name: 'Stranger' },
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

const {
  computeRegistrationOpensAt,
  resolveSeriesRegistrationOpensAt,
} = require('../utils/seriesRegistrationRule');
const { formatJerusalemDate, formatJerusalemTime, parseJerusalemTimeToUTC } = require('../utils/timezone');

const jer = (d) => `${formatJerusalemDate(d)} ${formatJerusalemTime(d)}`;

describe('computeRegistrationOpensAt', () => {
  // 2026-10-03 is a Saturday.
  const satGame = parseJerusalemTimeToUTC('2026-10-03', '20:00');

  test('Saturday 20:00 game + Sunday 18:00 rule opens the preceding Sunday at 18:00', () => {
    expect(jer(computeRegistrationOpensAt(satGame, 0, '18:00'))).toBe('2026-09-27 18:00');
  });

  test('same weekday earlier in the day stays on the game day', () => {
    expect(jer(computeRegistrationOpensAt(satGame, 6, '10:00'))).toBe('2026-10-03 10:00');
  });

  test('same weekday at/after the game time falls back a full week', () => {
    expect(jer(computeRegistrationOpensAt(satGame, 6, '21:00'))).toBe('2026-09-26 21:00');
    expect(jer(computeRegistrationOpensAt(satGame, 6, '20:00'))).toBe('2026-09-26 20:00');
  });

  test('keeps the local wall-clock time across the DST change (Israel, 2026-10-25)', () => {
    const gameAfterDst = parseJerusalemTimeToUTC('2026-10-31', '20:00');
    const opens = computeRegistrationOpensAt(gameAfterDst, 6, '21:00'); // previous Sat, still summer time
    expect(jer(opens)).toBe('2026-10-24 21:00');
    // A fixed hours offset would have drifted by an hour here.
    expect(gameAfterDst.getTime() - opens.getTime()).not.toBe((7 * 24 - 1) * 3600000);
  });

  test('invalid rules return null', () => {
    expect(computeRegistrationOpensAt(satGame, 7, '18:00')).toBeNull();
    expect(computeRegistrationOpensAt(satGame, 0, '25:00')).toBeNull();
    expect(computeRegistrationOpensAt(satGame, 0, '18:0')).toBeNull();
  });

  test('resolver prefers the weekday rule, then legacy hours, else null', () => {
    expect(jer(resolveSeriesRegistrationOpensAt(
      { registrationOpenDayOfWeek: 0, registrationOpenTime: '18:00', autoOpenRegistrationHours: 5 }, satGame
    ))).toBe('2026-09-27 18:00');
    expect(resolveSeriesRegistrationOpensAt({ autoOpenRegistrationHours: 24 }, satGame).getTime())
      .toBe(satGame.getTime() - 24 * 3600000);
    expect(resolveSeriesRegistrationOpensAt({}, satGame)).toBeNull();
  });
});

describe('PATCH /api/series/:id registration-open rule', () => {
  const { prisma } = require('../services/gameService');
  const gameScheduler = require('../services/gameScheduler');
  const { app } = require('../index');

  const spies = [];
  const spy = (obj, method) => {
    const s = jest.spyOn(obj, method);
    spies.push(s);
    return s;
  };

  const baseSeries = {
    id: 'srr_series',
    organizerId: 'srr_org',
    type: 'WEEKLY',
    dayOfWeek: 6,
    time: '20:00',
    autoOpenRegistrationHours: 48,
    registrationOpenDayOfWeek: null,
    registrationOpenTime: null,
  };
  const futureStarts = [
    parseJerusalemTimeToUTC('2026-10-03', '20:00'),
    parseJerusalemTimeToUTC('2026-10-10', '20:00'),
  ];

  let seriesUpdate;
  let gameUpdate;
  let gameFindMany;

  beforeEach(() => {
    spy(prisma.gameSeries, 'findUnique').mockResolvedValue({ ...baseSeries });
    spy(prisma.seriesParticipant, 'findUnique').mockResolvedValue(null);
    seriesUpdate = spy(prisma.gameSeries, 'update').mockImplementation(async ({ data }) => ({ ...baseSeries, ...data }));
    gameFindMany = spy(prisma.game, 'findMany').mockResolvedValue(
      futureStarts.map((start, i) => ({ id: `srr_game_${i}`, seriesId: 'srr_series', start, fieldId: 'f1' }))
    );
    gameUpdate = spy(prisma.game, 'update').mockImplementation(({ where, data }) => ({ id: where.id, ...data }));
    spy(prisma, '$transaction').mockImplementation(async (ops) => Promise.all(ops));
    spy(gameScheduler, 'resyncGame').mockImplementation(() => {});
  });

  afterEach(() => {
    while (spies.length) spies.pop().mockRestore();
  });

  const patch = (body, token = 'mock_token_organizer') =>
    request(app).patch('/api/series/srr_series').set('Authorization', `Bearer ${token}`).send(body);

  test('setting Sunday 18:00 stores the rule, clears legacy hours and updates every future game', async () => {
    const res = await patch({ registrationOpenDayOfWeek: 0, registrationOpenTime: '18:00' });
    expect(res.statusCode).toBe(200);

    expect(seriesUpdate.mock.calls[0][0].data).toEqual(expect.objectContaining({
      registrationOpenDayOfWeek: 0,
      registrationOpenTime: '18:00',
      autoOpenRegistrationHours: null,
    }));
    expect(gameFindMany.mock.calls[0][0].where).toEqual(expect.objectContaining({ seriesId: 'srr_series', status: 'OPEN' }));
    const opens = gameUpdate.mock.calls.map((c) => jer(c[0].data.registrationOpensAt));
    expect(opens).toEqual(['2026-09-27 18:00', '2026-10-04 18:00']);
    expect(res.body.updatedGames).toBe(2);
  });

  test('clearing the rule (both null) nulls registrationOpensAt on future games', async () => {
    const res = await patch({ registrationOpenDayOfWeek: null, registrationOpenTime: null, autoOpenRegistrationHours: null });
    expect(res.statusCode).toBe(200);
    expect(gameUpdate.mock.calls.every((c) => c[0].data.registrationOpensAt === null)).toBe(true);
  });

  test('legacy hours clear the weekday rule', async () => {
    const res = await patch({ autoOpenRegistrationHours: 24 });
    expect(res.statusCode).toBe(200);
    expect(seriesUpdate.mock.calls[0][0].data).toEqual(expect.objectContaining({
      autoOpenRegistrationHours: 24,
      registrationOpenDayOfWeek: null,
      registrationOpenTime: null,
    }));
  });

  test.each([
    [{ registrationOpenDayOfWeek: 0 }],
    [{ registrationOpenDayOfWeek: 7, registrationOpenTime: '18:00' }],
    [{ registrationOpenDayOfWeek: 0, registrationOpenTime: '6pm' }],
    [{ registrationOpenDayOfWeek: 0, registrationOpenTime: '18:00', autoOpenRegistrationHours: 12 }],
  ])('invalid rule %j is a 400 and changes nothing', async (body) => {
    const res = await patch(body);
    expect(res.statusCode).toBe(400);
    expect(seriesUpdate).not.toHaveBeenCalled();
    expect(gameUpdate).not.toHaveBeenCalled();
  });

  test('non-managers get 403', async () => {
    const res = await patch({ registrationOpenDayOfWeek: 0, registrationOpenTime: '18:00' }, 'mock_token_stranger');
    expect(res.statusCode).toBe(403);
    expect(seriesUpdate).not.toHaveBeenCalled();
  });

  test('changing the group time recomputes registration under an existing weekday rule', async () => {
    prisma.gameSeries.findUnique.mockResolvedValue({
      ...baseSeries, autoOpenRegistrationHours: null, registrationOpenDayOfWeek: 6, registrationOpenTime: '19:00',
    });
    seriesUpdate.mockImplementation(async ({ data }) => ({
      ...baseSeries, autoOpenRegistrationHours: null, registrationOpenDayOfWeek: 6, registrationOpenTime: '19:00', ...data,
    }));
    const res = await patch({ time: '18:00' });
    expect(res.statusCode).toBe(200);
    // New start is Sat 18:00, so a Sat 19:00 rule now falls back to the previous Saturday.
    expect(jer(gameUpdate.mock.calls[0][0].data.registrationOpensAt)).toBe('2026-09-26 19:00');
  });

  test('unrelated edits leave registrationOpensAt alone', async () => {
    const res = await patch({ title: 'חדש' });
    expect(res.statusCode).toBe(200);
    expect(gameUpdate.mock.calls.every((c) => !('registrationOpensAt' in c[0].data))).toBe(true);
  });
});
