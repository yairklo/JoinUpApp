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

    await prisma.participation.createMany({
      data: [
        { gameId: soonGame.id, userId: ownerId, status: 'CONFIRMED' },
        { gameId: soonGame.id, userId: coMgrId, status: 'CONFIRMED' },
        { gameId: soonGame.id, userId: playerId, status: 'WAITLISTED' },
        { gameId: laterGame.id, userId: playerId, status: 'PENDING' },
        { gameId: soloGame.id, userId: playerId, status: 'PENDING' },
      ],
    });
  });

  afterAll(async () => {
    try {
      const ids = [soonGame, laterGame, soloGame, othersGame, cancelledSolo].filter(Boolean).map((g) => g.id);
      await prisma.participation.deleteMany({ where: { gameId: { in: ids } } });
      await prisma.gameRole.deleteMany({ where: { gameId: { in: ids } } });
      await prisma.game.deleteMany({ where: { id: { in: ids } } });
      if (series) {
        await prisma.seriesParticipant.deleteMany({ where: { seriesId: series.id } });
        await prisma.gameSeries.delete({ where: { id: series.id } });
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
});
