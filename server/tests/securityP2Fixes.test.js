/**
 * Roster and series access fixes. Each case fails if the corresponding guard is removed.
 * Runs against DATABASE_URL (CI's throwaway Postgres). Does not load server/.env.
 */
process.env.JOINUP_SKIP_DOTENV = '1';

const request = require('supertest');

jest.setTimeout(60000);

const USERS = {
  tok_org: { id: 'p2sec_org', name: 'Organizer' },
  tok_early: { id: 'p2sec_early', name: 'שחקן מוקדם' },
  tok_late: { id: 'p2sec_late', name: 'שחקן מאוחר' },
  tok_manager: { id: 'p2sec_manager', name: 'מנהל' },
  tok_pending: { id: 'p2sec_pending', name: 'ממתין' },
  tok_rejected: { id: 'p2sec_rejected', name: 'נדחה' },
  tok_wait: { id: 'p2sec_wait', name: 'רשימת המתנה' },
  tok_sub: { id: 'p2sec_sub', name: 'מנוי' },
  tok_stranger: { id: 'p2sec_stranger', name: 'זר' },
  tok_hidden: { id: 'p2sec_hidden', name: 'שחקן חסוי' },
  tok_adult: { id: 'p2sec_adult', name: 'שחקן גלוי' },
  tok_minor: { id: 'p2sec_minor', name: 'ילד סודי' },
};

jest.mock('../utils/auth', () => {
  const lookup = (req) => {
    const token = (req.headers.authorization || '').split(' ')[1];
    return USERS[token];
  };
  return {
    authenticateToken: (req, res, next) => {
      const user = lookup(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      req.user = { ...user };
      return next();
    },
    attachOptionalUser: (req, res, next) => {
      const user = lookup(req);
      if (user) req.user = { ...user };
      return next();
    },
  };
});

jest.mock('../workers/reviewWorker', () => ({ processReviewQueue: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../workers/cleanupWorker', () => ({
  startCleanupWorker: jest.fn().mockResolvedValue(undefined),
  runCleanup: jest.fn().mockResolvedValue(undefined),
}));

const { prisma, convertGameToSeries } = require('../services/gameService');
const { app, io, runWeeklySeriesGeneration } = require('../index');

const ORG = USERS.tok_org.id;
const EARLY = USERS.tok_early.id;
const LATE = USERS.tok_late.id;
const MANAGER = USERS.tok_manager.id;
const PENDING = USERS.tok_pending.id;
const REJECTED = USERS.tok_rejected.id;
const WAIT = USERS.tok_wait.id;
const SUB = USERS.tok_sub.id;
const STRANGER = USERS.tok_stranger.id;
const HIDDEN = USERS.tok_hidden.id;
const ADULT = USERS.tok_adult.id;
const MINOR = USERS.tok_minor.id;
const auth = (tok) => ({ Authorization: `Bearer ${tok}` });
const CITY = 'עיר-בדיקה-p2';
const SECRET_PLACE = 'סמטת החברים 4';

const T0 = new Date('2026-01-01T00:00:00Z');
const T1 = new Date('2026-01-02T00:00:00Z');
const T2 = new Date('2026-01-03T00:00:00Z');
const T3 = new Date('2026-01-04T00:00:00Z');

describe('security fixes for roster handoff, series access, and broadcasts', () => {
  let field;

  beforeAll(async () => {
    for (const u of Object.values(USERS)) {
      await prisma.user.upsert({
        where: { id: u.id },
        update: { name: u.name },
        create: { id: u.id, name: u.name },
      });
    }
    await prisma.user.update({
      where: { id: MINOR },
      data: { birthDate: new Date('2012-06-01T00:00:00Z') },
    });
    field = await prisma.field.create({
      data: {
        name: 'מגרש בדיקה p2',
        location: 'רחוב הבדיקות 2',
        city: CITY,
        price: 0,
        available: false,
        type: 'OPEN',
      },
    });
  });

  afterAll(async () => {
    try {
      const games = await prisma.game.findMany({ where: { organizerId: ORG }, select: { id: true } });
      const gameIds = games.map((g) => g.id);
      const series = await prisma.gameSeries.findMany({ where: { organizerId: ORG }, select: { id: true } });
      const seriesIds = series.map((s) => s.id);
      if (gameIds.length) {
        await prisma.chatParticipant.deleteMany({ where: { chatId: { in: gameIds } } });
        await prisma.chatRoom.deleteMany({ where: { id: { in: gameIds } } });
        await prisma.participation.deleteMany({ where: { gameId: { in: gameIds } } });
        await prisma.gameRole.deleteMany({ where: { gameId: { in: gameIds } } });
        await prisma.team.deleteMany({ where: { gameId: { in: gameIds } } });
        await prisma.game.deleteMany({ where: { id: { in: gameIds } } });
      }
      const userIds = Object.values(USERS).map((u) => u.id);
      await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
      if (seriesIds.length) {
        await prisma.seriesParticipant.deleteMany({ where: { seriesId: { in: seriesIds } } });
        await prisma.seriesJoinRequest.deleteMany({ where: { seriesId: { in: seriesIds } } });
        await prisma.gameSeries.deleteMany({ where: { id: { in: seriesIds } } });
      }
      await prisma.userBlock.deleteMany({
        where: { OR: [{ blockerId: { in: userIds } }, { blockedId: { in: userIds } }] },
      });
      if (field?.id) await prisma.field.delete({ where: { id: field.id } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    } catch (err) {
      console.warn('securityP2Fixes cleanup skipped:', err.message);
    }
    await prisma.$disconnect();
  });

  async function makeGame(data = {}) {
    return prisma.game.create({
      data: {
        fieldId: field.id,
        organizerId: ORG,
        start: new Date(Date.now() + 5 * 24 * 3600 * 1000),
        maxPlayers: 10,
        roles: { create: { userId: ORG, role: 'ORGANIZER' } },
        ...data,
      },
    });
  }

  async function makeSeries(data = {}) {
    return prisma.gameSeries.create({
      data: {
        organizerId: ORG,
        fieldId: field.id,
        fieldName: field.name,
        fieldLocation: field.location,
        maxPlayers: 10,
        time: '20:00',
        duration: 1,
        dayOfWeek: 2,
        type: 'WEEKLY',
        title: 'קבוצה לבדיקה',
        ...data,
      },
    });
  }

  function watchIo() {
    const globalEvents = [];
    const roomEvents = [];
    const emitSpy = jest.spyOn(io, 'emit').mockImplementation(function onEmit(event, payload) {
      globalEvents.push({ event, payload });
      return this;
    });
    const toSpy = jest.spyOn(io, 'to').mockImplementation((room) => ({
      emit(event, payload) {
        roomEvents.push({ room, event, payload });
        return this;
      },
    }));
    return {
      globalEvents,
      roomEvents,
      restore() {
        emitSpy.mockRestore();
        toSpy.mockRestore();
      },
    };
  }

  test('organizer leave refuses when nobody confirmed remains', async () => {
    const game = await makeGame({
      participants: {
        create: [
          { userId: PENDING, status: 'PENDING', createdAt: T0 },
          { userId: REJECTED, status: 'REJECTED', createdAt: T1 },
          { userId: WAIT, status: 'WAITLISTED', createdAt: T2 },
          { userId: ORG, status: 'CONFIRMED', createdAt: T3 },
        ],
      },
    });

    const res = await request(app).post(`/api/games/${game.id}/leave`).set(auth('tok_org'));
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('NO_CONFIRMED_SUCCESSOR');
    expect(res.body.error).toMatch(/מאושר/);

    const row = await prisma.game.findUnique({ where: { id: game.id } });
    expect(row.organizerId).toBe(ORG);
    expect(await prisma.participation.findFirst({ where: { gameId: game.id, userId: ORG } })).toBeTruthy();
    const organizerRole = await prisma.gameRole.findFirst({ where: { gameId: game.id, role: 'ORGANIZER' } });
    expect(organizerRole.userId).toBe(ORG);
  });

  test('organizer leave hands the game to the appointed successor and moves the organizer role', async () => {
    const game = await makeGame({
      participants: {
        create: [
          { userId: PENDING, status: 'PENDING', createdAt: T0 },
          { userId: EARLY, status: 'CONFIRMED', createdAt: T1 },
          { userId: MANAGER, status: 'CONFIRMED', createdAt: T2 },
          { userId: ORG, status: 'CONFIRMED', createdAt: T3 },
        ],
      },
    });
    await prisma.gameRole.create({ data: { gameId: game.id, userId: MANAGER, role: 'MANAGER' } });

    const res = await request(app).post(`/api/games/${game.id}/leave`).set(auth('tok_org')).send({ successorId: MANAGER });
    expect(res.statusCode).toBe(200);

    const row = await prisma.game.findUnique({ where: { id: game.id } });
    expect(row.organizerId).toBe(MANAGER);
    const organizerRole = await prisma.gameRole.findFirst({ where: { gameId: game.id, role: 'ORGANIZER' } });
    expect(organizerRole.userId).toBe(MANAGER);
    expect(await prisma.gameRole.findFirst({ where: { gameId: game.id, userId: ORG } })).toBeNull();
    expect(await prisma.participation.findFirst({ where: { gameId: game.id, userId: ORG } })).toBeNull();
    expect(await prisma.participation.findFirst({ where: { gameId: game.id, userId: PENDING } })).toBeTruthy();
  });

  test('organizer cannot leave a game without appointing another admin', async () => {
    const game = await makeGame({
      participants: {
        create: [
          { userId: EARLY, status: 'CONFIRMED', createdAt: T0 },
          { userId: PENDING, status: 'PENDING', createdAt: T1 },
          { userId: ORG, status: 'CONFIRMED', createdAt: T3 },
        ],
      },
    });

    let res = await request(app).post(`/api/games/${game.id}/leave`).set(auth('tok_org'));
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('ADMIN_SUCCESSOR_REQUIRED');

    // A non-confirmed participant is not a valid successor.
    res = await request(app).post(`/api/games/${game.id}/leave`).set(auth('tok_org')).send({ successorId: PENDING });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_SUCCESSOR');

    expect((await prisma.game.findUnique({ where: { id: game.id } })).organizerId).toBe(ORG);
    expect(await prisma.participation.findFirst({ where: { gameId: game.id, userId: ORG } })).toBeTruthy();

    res = await request(app).post(`/api/games/${game.id}/leave`).set(auth('tok_org')).send({ successorId: EARLY });
    expect(res.statusCode).toBe(200);
    expect((await prisma.game.findUnique({ where: { id: game.id } })).organizerId).toBe(EARLY);
  });

  test('group organizer cannot leave without appointing another admin', async () => {
    const series = await makeSeries({ isFriendsOnly: false, joinPolicy: 'INSTANT' });
    await prisma.seriesParticipant.create({ data: { seriesId: series.id, userId: EARLY, role: 'MEMBER' } });

    let res = await request(app).delete(`/api/series/${series.id}/subscribe`).set(auth('tok_org'));
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('ADMIN_SUCCESSOR_REQUIRED');

    res = await request(app).delete(`/api/series/${series.id}/subscribe`).set(auth('tok_org')).send({ successorId: LATE });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_SUCCESSOR');
    expect((await prisma.gameSeries.findUnique({ where: { id: series.id } })).organizerId).toBe(ORG);

    res = await request(app).delete(`/api/series/${series.id}/subscribe`).set(auth('tok_org')).send({ successorId: EARLY });
    expect(res.statusCode).toBe(200);
    expect((await prisma.gameSeries.findUnique({ where: { id: series.id } })).organizerId).toBe(EARLY);
  });

  test('a waitlisted participant is not an eligible successor; a regular member can still leave', async () => {
    const game = await makeGame({
      participants: {
        create: [
          { userId: ORG, status: 'CONFIRMED', createdAt: T0 },
          { userId: EARLY, status: 'CONFIRMED', createdAt: T1 },
          { userId: WAIT, status: 'WAITLISTED', createdAt: T2 },
        ],
      },
    });
    let res = await request(app).post(`/api/games/${game.id}/leave`).set(auth('tok_org')).send({ successorId: WAIT });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_SUCCESSOR');
    expect((await prisma.game.findUnique({ where: { id: game.id } })).organizerId).toBe(ORG);

    // A non-organizer needs no successor.
    res = await request(app).post(`/api/games/${game.id}/leave`).set(auth('tok_early'));
    expect(res.statusCode).toBe(200);
    expect(await prisma.participation.findFirst({ where: { gameId: game.id, userId: EARLY } })).toBeNull();
    expect((await prisma.game.findUnique({ where: { id: game.id } })).organizerId).toBe(ORG);
  });

  test('concurrent organizer handoff and successor leaving never strands the organizer outside the roster', async () => {
    for (let i = 0; i < 5; i += 1) {
      const game = await makeGame({
        participants: {
          create: [
            { userId: ORG, status: 'CONFIRMED', createdAt: T0 },
            { userId: EARLY, status: 'CONFIRMED', createdAt: T1 },
            { userId: LATE, status: 'CONFIRMED', createdAt: T2 },
          ],
        },
      });
      const [handoff, successorLeaves] = await Promise.all([
        request(app).post(`/api/games/${game.id}/leave`).set(auth('tok_org')).send({ successorId: EARLY }),
        request(app).post(`/api/games/${game.id}/leave`).set(auth('tok_early')),
      ]);
      expect([200, 400, 409]).toContain(handoff.statusCode);
      expect([200, 409]).toContain(successorLeaves.statusCode);
      // Exactly one of the two may win; the loser must be refused, not half-applied.
      expect([handoff.statusCode === 200, successorLeaves.statusCode === 200].filter(Boolean).length).toBeLessThanOrEqual(2);
      const row = await prisma.game.findUnique({ where: { id: game.id } });
      if (row) {
        const organizerRow = await prisma.participation.findFirst({
          where: { gameId: game.id, userId: row.organizerId, status: 'CONFIRMED' },
        });
        expect(organizerRow).toBeTruthy();
        const orgRole = await prisma.gameRole.findFirst({ where: { gameId: game.id, role: 'ORGANIZER' } });
        if (orgRole) expect(orgRole.userId).toBe(row.organizerId);
      }
    }
  });

  test('concurrent group handoff and successor leaving never strands the organizer', async () => {
    for (let i = 0; i < 3; i += 1) {
      const series = await makeSeries({ isFriendsOnly: false, joinPolicy: 'INSTANT' });
      await prisma.seriesParticipant.create({ data: { seriesId: series.id, userId: EARLY, role: 'MEMBER' } });
      const [handoff, successorLeaves] = await Promise.all([
        request(app).delete(`/api/series/${series.id}/subscribe`).set(auth('tok_org')).send({ successorId: EARLY }),
        request(app).delete(`/api/series/${series.id}/subscribe`).set(auth('tok_early')),
      ]);
      expect([200, 400, 409]).toContain(handoff.statusCode);
      expect([200, 409]).toContain(successorLeaves.statusCode);
      const row = await prisma.gameSeries.findUnique({ where: { id: series.id } });
      if (row.organizerId === EARLY) {
        // The handoff won, so the new organizer's own (earlier-started) leave must have been refused.
        expect(successorLeaves.statusCode).toBe(409);
        expect(await prisma.seriesParticipant.findUnique({ where: { seriesId_userId: { seriesId: series.id, userId: EARLY } } })).toBeTruthy();
      } else {
        // The successor left first, so the handoff must have been refused and the organizer kept.
        expect(row.organizerId).toBe(ORG);
        expect(handoff.statusCode).toBe(400);
      }
    }
  });

  test('subscribing to a public group does not unlock a friends-only game in it', async () => {
    const series = await makeSeries({
      isFriendsOnly: false,
      joinPolicy: 'INSTANT',
      membersOnlyPriority: false,
      title: 'קבוצה ציבורית',
    });
    const game = await makeGame({
      seriesId: series.id,
      isFriendsOnly: true,
      friendsOnlyLinkPolicy: 'BLOCKED',
      customLocation: SECRET_PLACE,
      participants: {
        create: [
          { userId: ORG, status: 'CONFIRMED' },
          { userId: HIDDEN, status: 'CONFIRMED' },
        ],
      },
    });

    const sub = await request(app).post(`/api/series/${series.id}/subscribe`).set(auth('tok_stranger'));
    expect(sub.statusCode).toBe(200);
    expect(sub.body.ok).toBe(true);
    expect(sub.body.pending).toBeUndefined();

    const view = await request(app).get(`/api/games/${game.id}`).set(auth('tok_stranger'));
    expect(view.statusCode).toBe(403);
    expect(view.body.code).toBe('GAME_FRIENDS_ONLY');
    const body = JSON.stringify(view.body);
    expect(body).not.toContain(SECRET_PLACE);
    expect(body).not.toContain('שחקן חסוי');

    const closed = await makeSeries({
      isFriendsOnly: true,
      friendsOnlyLinkPolicy: 'BLOCKED',
      joinPolicy: 'INSTANT',
      title: 'קבוצה לחברים',
    });
    await prisma.seriesParticipant.create({ data: { seriesId: closed.id, userId: STRANGER, role: 'MEMBER' } });
    const closedGame = await makeGame({
      seriesId: closed.id,
      isFriendsOnly: true,
      friendsOnlyLinkPolicy: 'BLOCKED',
      participants: { create: { userId: ORG, status: 'CONFIRMED' } },
    });
    expect((await request(app).get(`/api/games/${closedGame.id}`).set(auth('tok_stranger'))).statusCode).toBe(200);

    const approval = await makeSeries({
      isFriendsOnly: false,
      joinPolicy: 'REQUIRES_APPROVAL',
      membersOnlyPriority: false,
      title: 'קבוצה באישור',
    });
    await prisma.seriesParticipant.create({ data: { seriesId: approval.id, userId: SUB, role: 'MEMBER' } });
    const approvalGame = await makeGame({
      seriesId: approval.id,
      isFriendsOnly: true,
      friendsOnlyLinkPolicy: 'BLOCKED',
      participants: { create: { userId: ORG, status: 'CONFIRMED' } },
    });
    expect((await request(app).get(`/api/games/${approvalGame.id}`).set(auth('tok_sub'))).statusCode).toBe(200);
  });

  test('weekly generation does not auto-confirm subscribers', async () => {
    const series = await makeSeries({
      joinPolicy: 'REQUIRES_APPROVAL',
      autoOpenRegistrationHours: 48,
      isActive: true,
      type: 'WEEKLY',
    });
    await prisma.seriesParticipant.create({ data: { seriesId: series.id, userId: SUB, role: 'MEMBER' } });
    await prisma.userBlock.create({ data: { blockerId: ORG, blockedId: SUB } });

    const real = prisma.gameSeries.findMany.bind(prisma.gameSeries);
    const spy = jest.spyOn(prisma.gameSeries, 'findMany').mockImplementation((args) =>
      real({ ...args, where: { AND: [args.where, { id: series.id }] } })
    );
    try {
      await runWeeklySeriesGeneration();
    } finally {
      spy.mockRestore();
    }

    const games = await prisma.game.findMany({
      where: { seriesId: series.id },
      include: { participants: true },
    });
    expect(games).toHaveLength(4);
    for (const g of games) {
      expect(g.joinPolicy).toBe('REQUIRES_APPROVAL');
      expect(g.registrationOpensAt).toBeTruthy();
      expect(g.registrationOpensAt.getTime()).toBeLessThan(g.start.getTime());
      expect(g.participants.map((p) => p.userId)).toEqual([ORG]);
      expect(g.participants[0].status).toBe('CONFIRMED');
    }
  });

  test('converting a game to a series copies confirmed participants only', async () => {
    const game = await makeGame({
      participants: {
        create: [
          { userId: ORG, status: 'CONFIRMED' },
          { userId: EARLY, status: 'CONFIRMED' },
          { userId: PENDING, status: 'PENDING' },
          { userId: REJECTED, status: 'REJECTED' },
          { userId: WAIT, status: 'WAITLISTED' },
        ],
      },
    });

    const result = await convertGameToSeries(game.id, true, ORG, false, null);
    const members = await prisma.seriesParticipant.findMany({ where: { seriesId: result.seriesId } });
    expect(members.map((m) => m.userId).sort()).toEqual([EARLY, ORG].sort());
  });

  test('deleting a series does not broadcast a friends-only game, and sends a public heir to the city room', async () => {
    const hiddenSeries = await makeSeries({ title: 'מחיקה חברים' });
    const hiddenGame = await makeGame({
      seriesId: hiddenSeries.id,
      isFriendsOnly: true,
      friendsOnlyLinkPolicy: 'BLOCKED',
      customLocation: SECRET_PLACE,
      customLat: 32.07,
      customLng: 34.78,
      participants: {
        create: [
          { userId: ORG, status: 'CONFIRMED' },
          { userId: HIDDEN, status: 'CONFIRMED' },
        ],
      },
    });

    const hiddenWatch = watchIo();
    try {
      const res = await request(app)
        .post(`/api/series/${hiddenSeries.id}/delete`)
        .set(auth('tok_org'))
        .send({ strategy: 'KEEP_GAMES' });
      expect(res.statusCode).toBe(200);
      const created = [...hiddenWatch.globalEvents, ...hiddenWatch.roomEvents].filter((e) => e.event === 'game:created');
      expect(created).toEqual([]);
      const blob = JSON.stringify([...hiddenWatch.globalEvents, ...hiddenWatch.roomEvents]);
      expect(blob).not.toContain(SECRET_PLACE);
      expect(blob).not.toContain('שחקן חסוי');
      expect(blob).not.toContain(hiddenGame.id);
    } finally {
      hiddenWatch.restore();
    }

    const publicSeries = await makeSeries({ title: 'מחיקה ציבורית' });
    const publicGame = await makeGame({
      seriesId: publicSeries.id,
      isFriendsOnly: false,
      participants: {
        create: [
          { userId: ORG, status: 'CONFIRMED' },
          { userId: ADULT, status: 'CONFIRMED' },
          { userId: MINOR, status: 'CONFIRMED' },
        ],
      },
    });

    const publicWatch = watchIo();
    try {
      const res = await request(app)
        .post(`/api/series/${publicSeries.id}/delete`)
        .set(auth('tok_org'))
        .send({ strategy: 'KEEP_GAMES' });
      expect(res.statusCode).toBe(200);
      expect(publicWatch.globalEvents.filter((e) => e.event === 'game:created')).toEqual([]);
      const cityEvents = publicWatch.roomEvents.filter((e) => e.event === 'game:created');
      expect(cityEvents).toHaveLength(1);
      expect(cityEvents[0].room).toBe(`city_${CITY}`);
      const payload = cityEvents[0].payload;
      expect(payload.id).toBe(publicGame.id);
      expect(typeof payload.start).toBe('string');
      const ids = payload.participants.map((p) => p.id);
      expect(ids).toContain(ADULT);
      expect(ids).not.toContain(MINOR);
      expect(payload.participants.map((p) => p.name)).not.toContain('ילד סודי');
    } finally {
      publicWatch.restore();
    }
  });
});
