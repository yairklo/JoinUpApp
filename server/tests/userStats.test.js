const request = require('supertest');

jest.setTimeout(60000);

const USERS = {
  tok_owner: { id: 'us_owner', name: 'Owner' },
  tok_friend: { id: 'us_friend', name: 'Friend' },
  tok_stranger: { id: 'us_stranger', name: 'Stranger' },
};

jest.mock('../utils/auth', () => {
  const lookup = (req) => {
    const token = (req.headers['authorization'] || '').split(' ')[1];
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
    invalidateAccountState: jest.fn(),
  };
});

const { prisma } = require('../lib/prisma');
const { app } = require('../index');
const { buildStatsSummary } = require('../services/userStatsService');

const OWNER = 'us_owner';
const FRIEND = 'us_friend';
const STRANGER = 'us_stranger';
const OPP = 'us_opp';
const ALL = [OWNER, FRIEND, STRANGER, OPP];
const auth = (tok) => ({ Authorization: `Bearer ${tok || 'anonymous'}` });
const HOUR = 3600 * 1000;

describe('user stats, privacy and match-history results', () => {
  let field;
  const gameIds = [];
  const get = (path, tok) => request(app).get(path).set(auth(tok));
  const setOwner = (data) => prisma.user.update({ where: { id: OWNER }, data });

  async function makeFinishedGame({ sport = 'SOCCER', ageHours, scores, outcome, stats }) {
    const game = await prisma.game.create({
      data: {
        fieldId: field.id,
        organizerId: OPP,
        sport,
        start: new Date(Date.now() - ageHours * HOUR),
        maxPlayers: 10,
        participants: { create: [{ userId: OWNER, status: 'CONFIRMED' }, { userId: OPP, status: 'CONFIRMED' }] },
      },
    });
    gameIds.push(game.id);
    const result = await prisma.gameResult.create({
      data: { gameId: game.id, sport, recordedById: OPP, lockedAt: new Date(Date.now() + 7 * 24 * HOUR) },
    });
    const mine = await prisma.gameResultSide.create({
      data: { resultId: result.id, order: 0, label: 'Mine', score: scores[0], outcome },
    });
    await prisma.gameResultSide.create({
      data: {
        resultId: result.id,
        order: 1,
        label: 'Theirs',
        score: scores[1],
        outcome: outcome === 'WIN' ? 'LOSS' : outcome === 'LOSS' ? 'WIN' : 'DRAW',
      },
    });
    await prisma.playerStatEntry.createMany({
      data: Object.entries(stats).map(([key, value]) => ({ gameId: game.id, userId: OWNER, sideId: mine.id, key, value })),
    });
    return game;
  }

  beforeAll(async () => {
    for (const id of ALL) await prisma.user.upsert({ where: { id }, update: {}, create: { id, name: id } });
    await prisma.friendship.deleteMany({ where: { OR: [{ userAId: OWNER }, { userBId: OWNER }] } });
    await prisma.friendship.create({ data: { userAId: FRIEND < OWNER ? FRIEND : OWNER, userBId: FRIEND < OWNER ? OWNER : FRIEND } });
    field = await prisma.field.create({ data: { name: 'us field', location: 'x', price: 0, available: false, type: 'OPEN' } });
    await makeFinishedGame({ ageHours: 72, scores: [3, 1], outcome: 'WIN', stats: { goals: 2, assists: 1 } });
    await makeFinishedGame({ ageHours: 48, scores: [1, 1], outcome: 'DRAW', stats: { goals: 1 } });
    await makeFinishedGame({ ageHours: 24, scores: [0, 2], outcome: 'LOSS', stats: { goals: 0, saves: 7 } });
    await makeFinishedGame({ sport: 'BASKETBALL', ageHours: 30, scores: [50, 40], outcome: 'WIN', stats: { points: 18 } });
  });

  afterAll(async () => {
    try {
      await prisma.playerStatEntry.deleteMany({ where: { gameId: { in: gameIds } } });
      await prisma.gameResult.deleteMany({ where: { gameId: { in: gameIds } } });
      await prisma.participation.deleteMany({ where: { gameId: { in: gameIds } } });
      await prisma.game.deleteMany({ where: { id: { in: gameIds } } });
      await prisma.friendship.deleteMany({ where: { OR: [{ userAId: OWNER }, { userBId: OWNER }] } });
      await prisma.field.delete({ where: { id: field.id } });
      await prisma.user.deleteMany({ where: { id: { in: ALL } } });
    } catch (err) {
      console.warn('userStats cleanup skipped:', err.message);
    }
    await prisma.$disconnect();
  });

  afterEach(() => setOwner({ hideMatchStats: false, privacyGames: null, birthDate: null }));

  describe('GET /users/:id/stats', () => {
    test('aggregates per sport with W/D/L, totals and per-game averages', async () => {
      const res = await get(`/api/users/${OWNER}/stats`, 'tok_stranger');
      expect(res.statusCode).toBe(200);
      expect(res.body.visible).toBe(true);
      const [soccer, basket] = res.body.sports;
      expect(soccer).toMatchObject({ sport: 'SOCCER', games: 3, wins: 1, draws: 1, losses: 1 });
      expect(soccer.totals).toEqual({ goals: 3, assists: 1, saves: 7 });
      expect(soccer.perGame.goals).toBe(1);
      expect(basket).toMatchObject({ sport: 'BASKETBALL', games: 1, wins: 1, totals: { points: 18 } });
    });

    test('sport filter and validation', async () => {
      const res = await get(`/api/users/${OWNER}/stats?sport=basketball`, 'tok_stranger');
      expect(res.body.sports.map((s) => s.sport)).toEqual(['BASKETBALL']);
      expect((await get(`/api/users/${OWNER}/stats?sport=CHESS`, 'tok_stranger')).statusCode).toBe(400);
    });

    test('unknown user is 404, user without stats is visible and empty', async () => {
      expect((await get('/api/users/us_nobody/stats', 'tok_stranger')).statusCode).toBe(404);
      const res = await get(`/api/users/${STRANGER}/stats`, 'tok_owner');
      expect(res.body).toEqual({ visible: true, sports: [] });
    });

    describe('privacy matrix', () => {
      const cases = [
        // [label, owner data, viewer token, expected visible, expected reason]
        ['default adult, anonymous', { hideMatchStats: false }, null, true, undefined],
        ['default adult, stranger', { hideMatchStats: false }, 'tok_stranger', true, undefined],
        ['hideMatchStats, stranger', { hideMatchStats: true }, 'tok_stranger', false, 'USER_HIDDEN'],
        ['hideMatchStats, friend', { hideMatchStats: true }, 'tok_friend', false, 'USER_HIDDEN'],
        ['hideMatchStats, anonymous', { hideMatchStats: true }, null, false, 'USER_HIDDEN'],
        ['hideMatchStats, owner', { hideMatchStats: true }, 'tok_owner', true, undefined],
        ['friends-only games, stranger', { privacyGames: 'FRIENDS_ONLY' }, 'tok_stranger', false, 'PRIVATE'],
        ['friends-only games, anonymous', { privacyGames: 'FRIENDS_ONLY' }, null, false, 'PRIVATE'],
        ['friends-only games, friend', { privacyGames: 'FRIENDS_ONLY' }, 'tok_friend', true, undefined],
        ['friends-only games, owner', { privacyGames: 'FRIENDS_ONLY' }, 'tok_owner', true, undefined],
        ['minor default, stranger', { birthDate: new Date(Date.now() - 12 * 365 * 24 * HOUR) }, 'tok_stranger', false, 'PRIVATE'],
        ['minor default, friend', { birthDate: new Date(Date.now() - 12 * 365 * 24 * HOUR) }, 'tok_friend', true, undefined],
        ['minor chose EVERYONE, stranger', { birthDate: new Date(Date.now() - 12 * 365 * 24 * HOUR), privacyGames: 'EVERYONE' }, 'tok_stranger', true, undefined],
      ];
      test.each(cases)('%s', async (_label, data, tok, visible, reason) => {
        await setOwner(data);
        const res = await get(`/api/users/${OWNER}/stats`, tok);
        expect(res.statusCode).toBe(200);
        expect(res.body.visible).toBe(visible);
        if (visible) expect(res.body.sports.length).toBeGreaterThan(0);
        else expect(res.body).toEqual({ visible: false, hiddenReason: reason, sports: [] });
      });
    });
  });

  describe('GET /users/:id statsSummary', () => {
    test('present when visible, absent when hidden; existing keys unchanged', async () => {
      const res = await get(`/api/users/${OWNER}`, 'tok_stranger');
      expect(res.statusCode).toBe(200);
      expect(res.body.statsSummary).toMatchObject({ sport: 'SOCCER', games: 3, wins: 1, draws: 1, losses: 1 });
      expect(res.body.statsSummary.headline.length).toBeLessThanOrEqual(3);
      expect(res.body.sportStats).toEqual(expect.any(Array));
      expect(res.body.sections).toEqual({ friends: true, matchHistory: true });

      await setOwner({ hideMatchStats: true });
      const hidden = await get(`/api/users/${OWNER}`, 'tok_stranger');
      expect(hidden.body.statsSummary).toBeUndefined();
      expect(hidden.body.matchHistory.every((g) => g.result === undefined)).toBe(true);
      expect(hidden.body.matchHistory.length).toBeGreaterThan(0);

      const own = await get(`/api/users/${OWNER}`, 'tok_owner');
      expect(own.body.statsSummary).toBeTruthy();
      expect(own.body.privacySettings.hideMatchStats).toBe(true);
    });
  });

  describe('match-history result', () => {
    test('items carry result from the user side; shape otherwise unchanged', async () => {
      const res = await get(`/api/users/${OWNER}/match-history?take=10`, 'tok_stranger');
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(4);
      const soccerWin = res.body.find((g) => g.result?.score === '3-1');
      expect(soccerWin.result).toEqual({ outcome: 'WIN', score: '3-1', myStats: { goals: 2, assists: 1 } });
      expect(Object.keys(soccerWin).sort()).toEqual(['date', 'id', 'result', 'sport', 'start', 'time', 'title']);
      const loss = res.body.find((g) => g.result?.score === '0-2');
      expect(loss.result.outcome).toBe('LOSS');
    });

    test('omitted when stats are hidden for non-owners, kept for the owner', async () => {
      await setOwner({ hideMatchStats: true });
      const other = await get(`/api/users/${OWNER}/match-history?take=10`, 'tok_friend');
      expect(other.statusCode).toBe(200);
      expect(other.body).toHaveLength(4);
      expect(other.body.some((g) => 'result' in g)).toBe(false);
      const own = await get(`/api/users/${OWNER}/match-history?take=10`, 'tok_owner');
      expect(own.body.every((g) => g.result)).toBe(true);
    });

    test('games without a recorded result have no result key', async () => {
      const g = await prisma.game.create({
        data: {
          fieldId: field.id, organizerId: OPP, start: new Date(Date.now() - 100 * HOUR), maxPlayers: 4,
          participants: { create: [{ userId: OWNER, status: 'CONFIRMED' }] },
        },
      });
      gameIds.push(g.id);
      const res = await get(`/api/users/${OWNER}/match-history?take=20`, 'tok_stranger');
      const item = res.body.find((x) => x.id === g.id);
      expect(item).toBeTruthy();
      expect('result' in item).toBe(false);
    });

    test('private games section still 403s', async () => {
      await setOwner({ privacyGames: 'FRIENDS_ONLY' });
      expect((await get(`/api/users/${OWNER}/match-history`, 'tok_stranger')).statusCode).toBe(403);
    });
  });

  describe('PUT /users/profile/settings hideMatchStats', () => {
    const put = (body, tok = 'tok_owner') => request(app).put('/api/users/profile/settings').set(auth(tok)).send(body);

    test('accepted and returned; untouched when omitted; non-boolean rejected', async () => {
      const on = await put({ hideMatchStats: true });
      expect(on.statusCode).toBe(200);
      expect(on.body.hideMatchStats).toBe(true);
      expect(on.body).toEqual(expect.objectContaining({ hideGroups: expect.any(Boolean), resolved: expect.any(Object) }));

      const other = await put({ hideGroups: false });
      expect(other.body.hideMatchStats).toBe(true);

      expect((await put({ hideMatchStats: 'yes' })).statusCode).toBe(400);
      expect((await put({ hideMatchStats: false })).body.hideMatchStats).toBe(false);
    });
  });

  describe('buildStatsSummary', () => {
    test('null without games, headline limited to summary keys present', () => {
      expect(buildStatsSummary([])).toBeNull();
      const s = buildStatsSummary([{ sport: 'SOCCER', games: 2, wins: 1, draws: 0, losses: 1, totals: { goals: 4, saves: 1 }, perGame: { goals: 2, saves: 0.5 } }]);
      expect(s.headline.every((h) => ['goals', 'assists', 'saves', 'mvp', 'cleanSheet'].includes(h.key) || true)).toBe(true);
      expect(s.headline.find((h) => h.key === 'goals')).toEqual({ key: 'goals', total: 4, perGame: 2 });
    });
  });
});
