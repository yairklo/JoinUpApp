/**
 * Weekly series generation vs. a second job process. Game has a unique (seriesId, start), so a
 * concurrent run that read a stale "no future games yet" view must hit P2002 per occurrence and
 * skip it — not abort, not create duplicates. The stale view is simulated by stubbing the
 * generator's future-games read once; the generator is scoped to this test's series only so it
 * never touches other series in the shared dev DB.
 */
jest.setTimeout(60000);

jest.mock('../workers/reviewWorker', () => ({ processReviewQueue: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../workers/cleanupWorker', () => ({
  startCleanupWorker: jest.fn().mockResolvedValue(undefined),
  runCleanup: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/gameScheduler', () => ({
  init: jest.fn(),
  loadAll: jest.fn().mockResolvedValue(undefined),
  resyncGame: jest.fn(),
  cancelGame: jest.fn(),
}));

const { prisma } = require('../services/gameService');
const { runWeeklySeriesGeneration } = require('../index');

describe('runWeeklySeriesGeneration duplicate guard', () => {
  const organizerId = 'sgd_test_organizer';
  let field;
  let series;

  const seriesGames = () =>
    prisma.game.findMany({ where: { seriesId: series.id }, select: { id: true, start: true }, orderBy: { start: 'asc' } });

  const cleanup = async () => {
    if (!series) return;
    const ids = (await prisma.game.findMany({ where: { seriesId: series.id }, select: { id: true } })).map((g) => g.id);
    await prisma.chatRoom.deleteMany({ where: { id: { in: ids } } });
    await prisma.participation.deleteMany({ where: { gameId: { in: ids } } });
    await prisma.gameRole.deleteMany({ where: { gameId: { in: ids } } });
    await prisma.game.deleteMany({ where: { id: { in: ids } } });
  };

  beforeAll(async () => {
    await prisma.user.upsert({ where: { id: organizerId }, update: {}, create: { id: organizerId, name: 'SGD Organizer' } });
    field = await prisma.field.create({ data: { name: 'SGD Test Field', location: 'Test', type: 'OPEN' } });
    series = await prisma.gameSeries.create({
      data: {
        organizerId,
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
  });

  afterAll(async () => {
    await cleanup().catch((e) => console.warn('cleanup failed:', e.message));
    if (series) await prisma.gameSeries.delete({ where: { id: series.id } }).catch(() => {});
    if (field) await prisma.field.delete({ where: { id: field.id } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: organizerId } }).catch(() => {});
    await prisma.$disconnect();
  });

  afterEach(() => jest.restoreAllMocks());

  const onlyThisSeries = () => {
    const real = prisma.gameSeries.findMany.bind(prisma.gameSeries);
    jest.spyOn(prisma.gameSeries, 'findMany').mockImplementation((args) =>
      real({ ...args, where: { AND: [args.where, { id: series.id }] } })
    );
  };

  test('the DB rejects a second game in the same series slot', async () => {
    await cleanup();
    const start = new Date(Date.now() + 30 * 24 * 3600000);
    const data = { fieldId: field.id, seriesId: series.id, start, maxPlayers: 10, organizerId };
    const first = await prisma.game.create({ data });
    await expect(prisma.game.create({ data })).rejects.toMatchObject({ code: 'P2002' });
    // Non-series games are unaffected (NULL seriesId never collides).
    const loose = await prisma.game.create({ data: { ...data, seriesId: null } });
    const loose2 = await prisma.game.create({ data: { ...data, seriesId: null } });
    await prisma.game.deleteMany({ where: { id: { in: [first.id, loose.id, loose2.id] } } });
  });

  test('a run with a stale view skips existing occurrences instead of duplicating or failing', async () => {
    await cleanup();
    onlyThisSeries();
    await runWeeklySeriesGeneration();
    const before = await seriesGames();
    expect(before).toHaveLength(4);

    // Second "process": it read the future games before the first one committed.
    const realFindMany = prisma.game.findMany.bind(prisma.game);
    jest.spyOn(prisma.game, 'findMany').mockImplementationOnce(async () => []).mockImplementation(realFindMany);
    const errorSpy = jest.spyOn(console, 'error');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await runWeeklySeriesGeneration();

    const after = await seriesGames();
    expect(after.map((g) => g.id)).toEqual(before.map((g) => g.id));
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy.mock.calls.filter(([msg]) => String(msg).includes('already exists'))).toHaveLength(4);
    // No orphan group chats were left behind by the rolled-back occurrence transactions.
    expect(await prisma.chatRoom.count({ where: { id: { in: after.map((g) => g.id) } } })).toBe(4);
  });

  test('moving an occurrence onto another occurrence slot is a 409, not a 500', async () => {
    const { updateGame } = require('../services/gameService');
    const games = await seriesGames();
    expect(games.length).toBeGreaterThanOrEqual(2);
    await expect(
      updateGame(games[1].id, { start: games[0].start.toISOString() }, organizerId, null)
    ).rejects.toMatchObject({ status: 409 });
  });
});
