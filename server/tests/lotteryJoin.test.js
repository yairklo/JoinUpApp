const request = require('supertest');

jest.setTimeout(30000);

// 1. Mocking authentication
jest.mock('../utils/auth', () => ({
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'No token provided' });

    if (token === 'mock_token_organizer') {
      req.user = { id: 'user_org_123', name: 'Organizer', avatar: 'org_img' };
    } else {
      const playerMatch = /^mock_token_player(\d+)$/.exec(token || '');
      if (!playerMatch) return res.status(403).json({ error: 'Invalid token' });
      req.user = { id: `user_play_${playerMatch[1]}`, name: `Player ${playerMatch[1]}`, avatar: 'p_img' };
    }
    return next();
  },
  attachOptionalUser: (req, res, next) => {
    req.user = { id: 'user_org_123', name: 'Organizer', avatar: 'org_img' };
    return next();
  }
}));

// 2. Mocking workers safely
jest.mock('../workers/reviewWorker', () => ({
  processReviewQueue: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../workers/gameReminderWorker', () => ({
  startGameReminderWorker: jest.fn().mockResolvedValue(undefined),
  checkUpcomingGames: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../workers/cleanupWorker', () => ({
  startCleanupWorker: jest.fn().mockResolvedValue(undefined),
  runCleanup: jest.fn().mockResolvedValue(undefined)
}));

const { prisma } = require('../services/gameService');
const { app } = require('../index');

describe('Lottery join mode', () => {
  const orgId = 'user_org_123';
  const playerIds = ['user_play_1', 'user_play_2', 'user_play_3'];
  const tokens = ['mock_token_player1', 'mock_token_player2', 'mock_token_player3'];
  let field;
  const gameIds = [];

  async function makeGame(data) {
    const g = await prisma.game.create({
      data: {
        fieldId: field.id,
        organizerId: orgId,
        start: new Date(Date.now() + 48 * 3600 * 1000),
        maxPlayers: 2,
        lotteryEnabled: true,
        joinPolicy: 'INSTANT',
        ...data,
      },
    });
    gameIds.push(g.id);
    await prisma.participation.create({
      data: { gameId: g.id, userId: orgId, status: data.organizerInLottery ? 'WAITLISTED' : 'CONFIRMED' },
    });
    return g;
  }
  const join = (gameId, i) =>
    request(app).post(`/api/games/${gameId}/join`).set('Authorization', `Bearer ${tokens[i]}`);
  const statusOf = (gameId, userId) =>
    prisma.participation.findFirst({ where: { gameId, userId } }).then(p => p && p.status);
  const future = () => new Date(Date.now() + 3600 * 1000);
  const past = () => new Date(Date.now() - 3600 * 1000);

  beforeAll(async () => {
    await prisma.user.upsert({ where: { id: orgId }, update: {}, create: { id: orgId, name: 'Organizer', imageUrl: 'x' } });
    field = await prisma.field.create({
      data: { name: 'lottery test field', location: 'x', city: 'תל אביב', price: 1, rating: 5, available: false, type: 'OPEN' },
    });
  });

  afterAll(async () => {
    for (const id of gameIds) {
      await prisma.participation.deleteMany({ where: { gameId: id } });
      await prisma.chatParticipant.deleteMany({ where: { chatId: id } });
      await prisma.game.delete({ where: { id } }).catch(() => {});
    }
    await prisma.field.delete({ where: { id: field.id } }).catch(() => {});
    await prisma.$disconnect();
  });

  test('pre-draw joiners all go into the pool, none is confirmed by join order', async () => {
    const g = await makeGame({ lotteryAt: future() });
    for (let i = 0; i < 3; i++) {
      const res = await join(g.id, i);
      expect(res.statusCode).toBe(200);
      expect(await statusOf(g.id, playerIds[i])).toBe('WAITLISTED');
    }
    // organizer (not in draw) keeps their seat
    expect(await statusOf(g.id, orgId)).toBe('CONFIRMED');
  });

  test('draw fills only free seats from the pool and marks the rest NOT_SELECTED', async () => {
    const gameScheduler = require('../services/gameScheduler');
    const g = await makeGame({ lotteryAt: future() });
    for (let i = 0; i < 3; i++) await join(g.id, i);
    await prisma.game.update({ where: { id: g.id }, data: { lotteryAt: past() } });
    await gameScheduler.drawLottery(prisma, g.id);
    const parts = await prisma.participation.findMany({ where: { gameId: g.id } });
    expect(parts.filter(p => p.status === 'CONFIRMED')).toHaveLength(2); // organizer + 1 winner
    expect(parts.filter(p => p.status === 'NOT_SELECTED')).toHaveLength(2);
  });

  test('organizerInLottery puts the organizer in the pool too', async () => {
    const g = await makeGame({ lotteryAt: future(), organizerInLottery: true });
    expect(await statusOf(g.id, orgId)).toBe('WAITLISTED');
  });

  test('missed draw: join after lotteryAt runs the draw lazily and never says window closed', async () => {
    const g = await makeGame({ lotteryAt: past() });
    const res = await join(g.id, 0);
    expect(res.statusCode).toBe(200);
    const game = await prisma.game.findUnique({ where: { id: g.id } });
    expect(game.lotteryExecutedAt).toBeTruthy();
    // seat was free (organizer + 1 of 2), so normal join confirms
    expect(await statusOf(g.id, playerIds[0])).toBe('CONFIRMED');
    const res2 = await join(g.id, 1);
    expect(res2.statusCode).toBe(200);
    expect(await statusOf(g.id, playerIds[1])).toBe('WAITLISTED'); // full now
  });

  test('missed draw: pool members are drawn before the new joiner is handled', async () => {
    const g = await makeGame({ lotteryAt: future() });
    await join(g.id, 0);
    await prisma.game.update({ where: { id: g.id }, data: { lotteryAt: past() } });
    const res = await join(g.id, 1);
    expect(res.statusCode).toBe(200);
    expect(await statusOf(g.id, playerIds[0])).toBe('CONFIRMED'); // sole pool member wins the free seat
    expect(await statusOf(g.id, playerIds[1])).toBe('WAITLISTED');
  });

  test('rejoin after draw: NOT_SELECTED user goes through normal capacity/waitlist', async () => {
    const g = await makeGame({ lotteryAt: past(), lotteryExecutedAt: new Date(), maxPlayers: 3 });
    await prisma.participation.create({ data: { gameId: g.id, userId: playerIds[0], status: 'NOT_SELECTED' } });
    const res = await join(g.id, 0);
    expect(res.statusCode).toBe(200);
    expect(await statusOf(g.id, playerIds[0])).toBe('CONFIRMED'); // free seat
    // full game -> waitlist
    const full = await makeGame({ lotteryAt: past(), lotteryExecutedAt: new Date(), maxPlayers: 1 });
    await prisma.participation.create({ data: { gameId: full.id, userId: playerIds[1], status: 'NOT_SELECTED' } });
    const res2 = await join(full.id, 1);
    expect(res2.statusCode).toBe(200);
    expect(await statusOf(full.id, playerIds[1])).toBe('WAITLISTED');
  });

  async function ensureUser(id) {
    await prisma.user.upsert({
      where: { id },
      update: {},
      create: { id, name: id, imageUrl: 'x' },
    });
  }

  test('concurrent joins after a missed draw never confirm more than maxPlayers', async () => {
    const maxPlayers = 2;
    const g = await makeGame({ lotteryAt: past(), maxPlayers });
    // Organizer holds one seat. Four pool members is more than the one seat left.
    for (let n = 10; n < 14; n++) {
      const id = `user_play_${n}`;
      await ensureUser(id);
      await prisma.participation.create({ data: { gameId: g.id, userId: id, status: 'WAITLISTED' } });
    }
    const joiners = [1, 2, 3, 4, 5];
    for (const n of joiners) await ensureUser(`user_play_${n}`);

    const results = await Promise.all(joiners.map((n) =>
      request(app).post(`/api/games/${g.id}/join`).set({ Authorization: `Bearer mock_token_player${n}` })
    ));
    for (const res of results) expect(res.statusCode).toBe(200);

    const parts = await prisma.participation.findMany({ where: { gameId: g.id } });
    const confirmed = parts.filter(p => p.status === 'CONFIRMED');
    expect(confirmed.length).toBeLessThanOrEqual(maxPlayers);
    const game = await prisma.game.findUnique({ where: { id: g.id } });
    expect(game.lotteryExecutedAt).toBeTruthy();
    // One column, one draw: every response saw the draw finish rather than a second claim.
    expect(parts.filter(p => p.status === 'NOT_SELECTED').length).toBeGreaterThan(0);
  });

  test('concurrent GETs after lotteryAt run the overdue draw once', async () => {
    const maxPlayers = 2;
    const g = await makeGame({ lotteryAt: past(), maxPlayers });
    for (let n = 10; n < 14; n++) {
      const id = `user_play_${n}`;
      await ensureUser(id);
      await prisma.participation.create({ data: { gameId: g.id, userId: id, status: 'WAITLISTED' } });
    }
    const viewers = [1, 2, 3, 4, 5];
    for (const n of viewers) await ensureUser(`user_play_${n}`);

    const results = await Promise.all(viewers.map((n) =>
      request(app).get(`/api/games/${g.id}`).set({ Authorization: `Bearer mock_token_player${n}` })
    ));
    for (const res of results) {
      expect(res.statusCode).toBe(200);
      expect(res.body.lotteryExecutedAt).toBeTruthy();
      expect(res.body.lotteryPending).toBe(false);
    }

    const parts = await prisma.participation.findMany({ where: { gameId: g.id } });
    const confirmed = parts.filter(p => p.status === 'CONFIRMED');
    expect(confirmed.length).toBeLessThanOrEqual(maxPlayers);
    expect(confirmed.length).toBe(maxPlayers);
    expect(parts.filter(p => p.status === 'NOT_SELECTED').length).toBeGreaterThan(0);
    expect(parts.filter(p => p.status === 'WAITLISTED')).toHaveLength(0);

    const before = parts.map(p => `${p.userId}:${p.status}`).sort();
    const again = await request(app).get(`/api/games/${g.id}`).set({ Authorization: 'Bearer mock_token_player1' });
    expect(again.statusCode).toBe(200);
    expect(again.body.lotteryExecutedAt).toBe(results[0].body.lotteryExecutedAt);
    const afterParts = await prisma.participation.findMany({ where: { gameId: g.id } });
    expect(afterParts.map(p => `${p.userId}:${p.status}`).sort()).toEqual(before);
  });

  test('a thrown draw rolls back lotteryExecutedAt and leaves the pool WAITLISTED', async () => {
    const gameScheduler = require('../services/gameScheduler');
    const g = await makeGame({ lotteryAt: past(), maxPlayers: 1 });
    await ensureUser(playerIds[0]);
    await prisma.participation.create({ data: { gameId: g.id, userId: playerIds[0], status: 'WAITLISTED' } });

    const throwing = {
      game: prisma.game,
      $transaction: (fn, opts) => prisma.$transaction(async (tx) => {
        const wrapped = new Proxy(tx, {
          get(target, prop) {
            if (prop === 'participation') {
              return new Proxy(target.participation, {
                get(part, method) {
                  if (method === 'updateMany') return () => Promise.reject(new Error('draw failed'));
                  const value = part[method];
                  return typeof value === 'function' ? value.bind(part) : value;
                },
              });
            }
            const value = target[prop];
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
        return fn(wrapped);
      }, opts),
    };

    await expect(gameScheduler.drawLottery(throwing, g.id)).rejects.toThrow('draw failed');
    const game = await prisma.game.findUnique({ where: { id: g.id } });
    expect(game.lotteryExecutedAt).toBeNull();
    expect(await statusOf(g.id, playerIds[0])).toBe('WAITLISTED');
    expect(await statusOf(g.id, orgId)).toBe('CONFIRMED');
  });

  test('left user (row deleted) can rejoin after the draw', async () => {
    const g = await makeGame({ lotteryAt: past(), lotteryExecutedAt: new Date(), maxPlayers: 3 });
    await join(g.id, 2);
    await request(app).post(`/api/games/${g.id}/leave`).set('Authorization', `Bearer ${tokens[2]}`);
    const res = await join(g.id, 2);
    expect(res.statusCode).toBe(200);
    expect(await statusOf(g.id, playerIds[2])).toBe('CONFIRMED');
  });
});
