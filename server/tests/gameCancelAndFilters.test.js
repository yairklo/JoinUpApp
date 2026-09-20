const request = require('supertest');

jest.setTimeout(60000);

jest.mock('../utils/auth', () => ({
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    const tokenMap = {
      mock_token_organizer: { id: 'gcf_test_org', name: 'Organizer', avatar: null },
      mock_token_player: { id: 'gcf_test_player', name: 'Player', avatar: null },
      mock_token_stranger: { id: 'gcf_test_str', name: 'Stranger', avatar: null },
    };
    if (!token || !tokenMap[token]) return res.status(401).json({ error: 'Unauthorized' });
    req.user = tokenMap[token];
    return next();
  },
  attachOptionalUser: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token === 'mock_token_player') req.user = { id: 'gcf_test_player', name: 'Player', avatar: null };
    next();
  },
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

describe('cancelling a single game and list filters', () => {
  const orgId = 'gcf_test_org';
  const playerId = 'gcf_test_player';
  const strId = 'gcf_test_str';
  const orgAuth = 'Bearer mock_token_organizer';
  const playerAuth = 'Bearer mock_token_player';
  const strAuth = 'Bearer mock_token_stranger';
  const startIn = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  let field;
  let soccerGame;
  let basketGame;
  const gameIds = [];

  const createGame = async (sport, title) => {
    const res = await request(app).post('/api/games').set('Authorization', orgAuth).send({
      title, maxPlayers: 4, fieldId: field.id, start: startIn(5), duration: 1, sport, isOpenToJoin: true, joinPolicy: 'INSTANT',
    });
    expect(res.statusCode).toEqual(201);
    gameIds.push(res.body.id);
    return res.body;
  };

  beforeAll(async () => {
    for (const id of [orgId, playerId, strId]) {
      await prisma.user.upsert({ where: { id }, update: {}, create: { id, name: id, imageUrl: null } });
    }
    field = await prisma.field.create({
      data: { name: 'מגרש בדיקה - cancel', location: 'רחוב הבדיקות 3', city: 'חיפה', price: 0, rating: 5, available: false, type: 'OPEN' },
    });
    soccerGame = await createGame('SOCCER', 'gcf soccer');
    basketGame = await createGame('BASKETBALL', 'gcf basket');
  });

  afterAll(async () => {
    try {
      await prisma.notification.deleteMany({ where: { userId: { in: [orgId, playerId, strId] } } });
      await prisma.participation.deleteMany({ where: { gameId: { in: gameIds } } });
      await prisma.gameRole.deleteMany({ where: { gameId: { in: gameIds } } });
      await prisma.chatParticipant.deleteMany({ where: { chatId: { in: gameIds } } });
      await prisma.chatRoom.deleteMany({ where: { id: { in: gameIds } } });
      await prisma.game.deleteMany({ where: { id: { in: gameIds } } });
      if (field?.id) await prisma.field.delete({ where: { id: field.id } });
    } catch (err) {
      console.warn('Clean up of gameCancelAndFilters test data skipped:', err.message);
    }
    await prisma.$disconnect();
  });

  test('GET /api/games?sport= really filters', async () => {
    const all = await request(app).get('/api/games');
    expect(all.statusCode).toEqual(200);
    expect(all.body.map((g) => g.id)).toEqual(expect.arrayContaining([soccerGame.id, basketGame.id]));

    const basket = await request(app).get('/api/games?sport=BASKETBALL');
    expect(basket.statusCode).toEqual(200);
    const ids = basket.body.map((g) => g.id);
    expect(ids).toContain(basketGame.id);
    expect(ids).not.toContain(soccerGame.id);
    for (const g of basket.body) expect(g.sport).toEqual('BASKETBALL');
  });

  test('GET /api/games?city= really filters', async () => {
    const inCity = await request(app).get(`/api/games?city=${encodeURIComponent('חיפה')}`);
    expect(inCity.body.map((g) => g.id)).toEqual(expect.arrayContaining([soccerGame.id, basketGame.id]));
    const other = await request(app).get(`/api/games?city=${encodeURIComponent('אילת')}`);
    expect(other.body.map((g) => g.id)).not.toContain(soccerGame.id);
  });

  test('only the organizer can cancel; a stranger gets 403', async () => {
    const res = await request(app).post(`/api/games/${soccerGame.id}/cancel`).set('Authorization', strAuth);
    expect(res.statusCode).toEqual(403);
    const row = await prisma.game.findUnique({ where: { id: soccerGame.id } });
    expect(row.status).toEqual('OPEN');
  });

  test('cancelling marks the game, notifies participants, hides it from lists and blocks joining', async () => {
    const join = await request(app).post(`/api/games/${soccerGame.id}/join`).set('Authorization', playerAuth);
    expect(join.statusCode).toEqual(200);

    const cancel = await request(app).post(`/api/games/${soccerGame.id}/cancel`).set('Authorization', orgAuth);
    expect(cancel.statusCode).toEqual(200);
    expect(cancel.body.status).toEqual('CANCELLED');
    expect(cancel.body.isOpenToJoin).toEqual(false);

    // sendNotification is fire-and-forget in cancelGame, so wait for the row instead of racing it
    let notif = null;
    for (let i = 0; i < 30 && !notif; i++) {
      notif = await prisma.notification.findFirst({ where: { userId: playerId, type: 'GAME_CANCELLED' } });
      if (!notif) await new Promise((r) => setTimeout(r, 200));
    }
    expect(notif).toBeTruthy();
    expect(notif.data.gameId).toEqual(soccerGame.id);
    // the organizer who cancelled is not notified about their own action
    expect(await prisma.notification.findFirst({ where: { userId: orgId, type: 'GAME_CANCELLED' } })).toBeNull();

    const detail = await request(app).get(`/api/games/${soccerGame.id}`).set('Authorization', playerAuth);
    expect(detail.statusCode).toEqual(200);
    expect(detail.body.status).toEqual('CANCELLED');

    const listed = await request(app).get('/api/games');
    expect(listed.body.map((g) => g.id)).not.toContain(soccerGame.id);
    const searched = await request(app).get('/api/games/search');
    expect(searched.body.map((g) => g.id)).not.toContain(soccerGame.id);

    const rejoin = await request(app).post(`/api/games/${soccerGame.id}/join`).set('Authorization', strAuth);
    expect(rejoin.statusCode).toEqual(400);
  });

  test('cancelling twice is idempotent and does not notify again', async () => {
    const before = await prisma.notification.count({ where: { userId: playerId, type: 'GAME_CANCELLED' } });
    const again = await request(app).post(`/api/games/${soccerGame.id}/cancel`).set('Authorization', orgAuth);
    expect(again.statusCode).toEqual(200);
    const after = await prisma.notification.count({ where: { userId: playerId, type: 'GAME_CANCELLED' } });
    expect(after).toEqual(before);
  });
});
