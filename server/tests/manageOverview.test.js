const request = require('supertest');

jest.setTimeout(60000);

jest.mock('../utils/auth', () => ({
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    const tokenMap = {
      mock_token_owner: { id: 'mo_owner', name: 'Owner', avatar: null },
      mock_token_comgr: { id: 'mo_comgr', name: 'Co-manager', avatar: null },
      mock_token_player: { id: 'mo_player', name: 'Player', avatar: null },
    };
    if (!token || !tokenMap[token]) return res.status(401).json({ error: 'Unauthorized' });
    req.user = tokenMap[token];
    return next();
  },
  attachOptionalUser: (req, res, next) => next(),
}));

jest.mock('../workers/reviewWorker', () => ({ processReviewQueue: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../workers/cleanupWorker', () => ({
  startCleanupWorker: jest.fn().mockResolvedValue(undefined),
  runCleanup: jest.fn().mockResolvedValue(undefined),
}));

const { prisma } = require('../services/gameService');
const { app } = require('../index');

describe('GET /api/manage/overview', () => {
  const ownerId = 'mo_owner';
  const coMgrId = 'mo_comgr';
  const playerId = 'mo_player';
  const ownerAuth = 'Bearer mock_token_owner';
  const coMgrAuth = 'Bearer mock_token_comgr';
  const playerAuth = 'Bearer mock_token_player';
  const hoursFromNow = (h) => new Date(Date.now() + h * 60 * 60 * 1000);

  let field;
  let series;
  let soonGame;
  let laterGame;
  let soloGame;
  let othersGame;
  let cancelledSolo;
  let liveSolo;
  let endedSolo;
  let bareSeries;
  let bareSeriesEnded;
  let inactiveSeries;
  let inactiveGame;

  beforeAll(async () => {
    for (const id of [ownerId, coMgrId, playerId]) {
      await prisma.user.upsert({ where: { id }, update: {}, create: { id, name: id, imageUrl: null } });
    }
    field = await prisma.field.create({
      data: { name: 'מגרש בדיקה - manage', location: 'רחוב 1', city: 'תל אביב', price: 0, rating: 5, available: false, type: 'OPEN' },
    });
    series = await prisma.gameSeries.create({
      data: {
        organizerId: ownerId, fieldName: field.name, fieldLocation: 'רחוב 1', maxPlayers: 10,
        dayOfWeek: 2, time: '20:00', duration: 1, title: 'קבוצת בדיקה',
      },
    });
    await prisma.seriesParticipant.createMany({
      data: [
        { seriesId: series.id, userId: ownerId, role: 'MANAGER' },
        { seriesId: series.id, userId: coMgrId, role: 'MANAGER' },
        { seriesId: series.id, userId: playerId, role: 'MEMBER' },
      ],
    });
    const base = { fieldId: field.id, maxPlayers: 2, organizerId: ownerId };
    laterGame = await prisma.game.create({ data: { ...base, seriesId: series.id, start: hoursFromNow(72) } });
    soonGame = await prisma.game.create({ data: { ...base, seriesId: series.id, start: hoursFromNow(24) } });
    soloGame = await prisma.game.create({ data: { ...base, start: hoursFromNow(48), title: 'משחק בודד' } });
    cancelledSolo = await prisma.game.create({ data: { ...base, start: hoursFromNow(30), status: 'CANCELLED' } });
    othersGame = await prisma.game.create({ data: { ...base, organizerId: playerId, start: hoursFromNow(10) } });
    await prisma.gameRole.create({ data: { gameId: othersGame.id, userId: ownerId, role: 'MANAGER' } });

    // Live-window boundary: a game still in progress is shown, one that ended hours ago is not.
    liveSolo = await prisma.game.create({ data: { ...base, start: hoursFromNow(-0.5), duration: 1, title: 'live' } });
    endedSolo = await prisma.game.create({ data: { ...base, start: hoursFromNow(-3), duration: 1, title: 'ended' } });

    // A group the owner organizes without any SeriesParticipant row, whose only game already ended.
    const seriesBase = { organizerId: ownerId, fieldName: field.name, fieldLocation: 'רחוב 1', maxPlayers: 10, dayOfWeek: 3, time: '21:00', duration: 1 };
    bareSeries = await prisma.gameSeries.create({ data: { ...seriesBase, title: 'קבוצה בלי משחקים' } });
    bareSeriesEnded = await prisma.game.create({ data: { ...base, seriesId: bareSeries.id, start: hoursFromNow(-3), duration: 1 } });

    // A deactivated group's open game is neither a group nor a "single game".
    inactiveSeries = await prisma.gameSeries.create({ data: { ...seriesBase, title: 'קבוצה לא פעילה', isActive: false } });
    inactiveGame = await prisma.game.create({ data: { ...base, seriesId: inactiveSeries.id, start: hoursFromNow(20) } });

    await prisma.participation.createMany({
      data: [
        { gameId: soonGame.id, userId: ownerId, status: 'CONFIRMED' },
        { gameId: soonGame.id, userId: coMgrId, status: 'CONFIRMED' },
        { gameId: soonGame.id, userId: playerId, status: 'WAITLISTED' },
        { gameId: laterGame.id, userId: playerId, status: 'PENDING' },
        { gameId: soloGame.id, userId: playerId, status: 'PENDING' },
        { gameId: soloGame.id, userId: coMgrId, status: 'REJECTED' },
        { gameId: soloGame.id, userId: ownerId, status: 'CANCELLED' },
      ],
    });
  });

  afterAll(async () => {
    try {
      const ids = [soonGame, laterGame, soloGame, othersGame, cancelledSolo, liveSolo, endedSolo, bareSeriesEnded, inactiveGame].filter(Boolean).map((g) => g.id);
      await prisma.participation.deleteMany({ where: { gameId: { in: ids } } });
      await prisma.gameRole.deleteMany({ where: { gameId: { in: ids } } });
      await prisma.game.deleteMany({ where: { id: { in: ids } } });
      for (const sr of [series, bareSeries, inactiveSeries].filter(Boolean)) {
        await prisma.seriesParticipant.deleteMany({ where: { seriesId: sr.id } });
        await prisma.gameSeries.delete({ where: { id: sr.id } });
      }
      if (field?.id) await prisma.field.delete({ where: { id: field.id } });
    } catch (err) {
      console.warn('Clean up of manage overview test data skipped:', err.message);
    }
    await prisma.$disconnect();
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/manage/overview');
    expect(res.statusCode).toEqual(401);
  });

  it('lists a managed group with its soonest game and counts', async () => {
    const res = await request(app).get('/api/manage/overview').set('Authorization', ownerAuth);
    expect(res.statusCode).toEqual(200);
    const group = res.body.groups.find((g) => g.id === series.id);
    expect(group).toMatchObject({ name: 'קבוצת בדיקה', role: 'ORGANIZER', memberCount: 3, pendingRequestCount: 1 });
    expect(group.nextGame).toMatchObject({ id: soonGame.id, confirmedCount: 2, waitlistCount: 1, maxPlayers: 2 });
  });

  it('lists standalone and role-managed games, excluding group games and cancelled ones', async () => {
    const res = await request(app).get('/api/manage/overview').set('Authorization', ownerAuth);
    const ids = res.body.games.map((g) => g.id);
    expect(ids).toEqual(expect.arrayContaining([soloGame.id, othersGame.id]));
    expect(ids).not.toContain(soonGame.id);
    expect(ids).not.toContain(laterGame.id);
    expect(ids).not.toContain(cancelledSolo.id);
    expect(ids.indexOf(othersGame.id)).toBeLessThan(ids.indexOf(soloGame.id));
    expect(res.body.games.find((g) => g.id === othersGame.id).role).toEqual('MANAGER');
    expect(res.body.games.find((g) => g.id === soloGame.id).role).toEqual('ORGANIZER');
  });

  it('flags pending requests and a full waitlist as needing attention', async () => {
    const res = await request(app).get('/api/manage/overview').set('Authorization', ownerAuth);
    const types = res.body.attention.map((a) => `${a.type}:${a.gameId}`);
    expect(types).toEqual(expect.arrayContaining([
      `WAITLIST:${soonGame.id}`,
      `PENDING_REQUESTS:${laterGame.id}`,
      `PENDING_REQUESTS:${soloGame.id}`,
    ]));
  });

  it('shows a series MANAGER the group as MANAGER', async () => {
    const res = await request(app).get('/api/manage/overview').set('Authorization', coMgrAuth);
    const group = res.body.groups.find((g) => g.id === series.id);
    expect(group.role).toEqual('MANAGER');
    expect(res.body.games.map((g) => g.id)).not.toContain(soloGame.id);
  });

  it('returns nothing for a plain member who manages nothing', async () => {
    const res = await request(app).get('/api/manage/overview').set('Authorization', playerAuth);
    expect(res.body.groups.find((g) => g.id === series.id)).toBeUndefined();
    expect(res.body.games.map((g) => g.id)).toEqual([othersGame.id]);
  });

  it('shows a game in progress but not one that ended hours ago', async () => {
    const res = await request(app).get('/api/manage/overview').set('Authorization', ownerAuth);
    const ids = res.body.games.map((g) => g.id);
    expect(ids).toContain(liveSolo.id);
    expect(ids).not.toContain(endedSolo.id);
    expect(ids.indexOf(liveSolo.id)).toBeLessThan(ids.indexOf(othersGame.id));
  });

  it('lists an organizer-only group with no upcoming game last, and ignores ended games', async () => {
    const res = await request(app).get('/api/manage/overview').set('Authorization', ownerAuth);
    const ids = res.body.groups.map((g) => g.id);
    expect(ids).toContain(bareSeries.id);
    expect(ids.indexOf(series.id)).toBeLessThan(ids.indexOf(bareSeries.id));
    const bare = res.body.groups.find((g) => g.id === bareSeries.id);
    expect(bare.nextGame).toBeNull();
    expect(bare.role).toEqual('ORGANIZER');
  });

  it('does not surface a deactivated group or its games', async () => {
    const res = await request(app).get('/api/manage/overview').set('Authorization', ownerAuth);
    expect(res.body.groups.map((g) => g.id)).not.toContain(inactiveSeries.id);
    expect(res.body.games.map((g) => g.id)).not.toContain(inactiveGame.id);
  });

  it('counts only confirmed, waitlisted and pending participations', async () => {
    const res = await request(app).get('/api/manage/overview').set('Authorization', ownerAuth);
    const solo = res.body.games.find((g) => g.id === soloGame.id);
    expect(solo).toMatchObject({ confirmedCount: 0, waitlistCount: 0, pendingCount: 1 });
  });

  it('labels each attention item with its group or game', async () => {
    const res = await request(app).get('/api/manage/overview').set('Authorization', ownerAuth);
    const forGroup = res.body.attention.find((a) => a.gameId === soonGame.id);
    const forSolo = res.body.attention.find((a) => a.gameId === soloGame.id);
    expect(forGroup.label).toEqual('קבוצת בדיקה');
    expect(forSolo.label).toEqual('משחק בודד');
  });
});
