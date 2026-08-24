const request = require('supertest');

jest.setTimeout(30000);

jest.mock('../utils/auth', () => ({
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    const tokenMap = {
      mock_token_organizer: { id: 'cap_test_org', name: 'Organizer', avatar: 'o.png' },
      mock_token_manager: { id: 'cap_test_mgr', name: 'Manager', avatar: 'm.png' },
      mock_token_moderator: { id: 'cap_test_mod', name: 'Moderator', avatar: 'md.png' },
      mock_token_player: { id: 'cap_test_ply', name: 'Player', avatar: 'p.png' },
      mock_token_waitlisted: { id: 'cap_test_wl', name: 'Waitlisted', avatar: 'w.png' },
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

describe('Captain-toggle endpoint: no game-management hierarchy gating, active-participant filter only', () => {
  let testGame;
  let testField;

  const orgId = 'cap_test_org';
  const mgrId = 'cap_test_mgr';
  const modId = 'cap_test_mod';
  const plyId = 'cap_test_ply';
  const wlId = 'cap_test_wl';

  const orgToken = 'mock_token_organizer';
  const mgrToken = 'mock_token_manager';
  const modToken = 'mock_token_moderator';
  const wlToken = 'mock_token_waitlisted';

  beforeAll(async () => {
    for (const id of [orgId, mgrId, modId, plyId, wlId]) {
      await prisma.user.upsert({ where: { id }, update: {}, create: { id, name: id, imageUrl: null } });
    }

    testField = await prisma.field.create({
      data: {
        name: 'מגרש בדיקה - captain role',
        location: 'רחוב הבדיקות 1',
        city: 'תל אביב',
        price: 0,
        rating: 5,
        available: false,
        type: 'OPEN',
      },
    });

    const createRes = await request(app)
      .post('/api/games')
      .set('Authorization', `Bearer ${orgToken}`)
      .send({
        title: 'משחק בדיקה - captain role',
        maxPlayers: 4, // room for organizer + manager + moderator + player, all CONFIRMED
        fieldId: testField.id,
        start: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        duration: 1,
        sport: 'SOCCER',
        isOpenToJoin: true,
        joinPolicy: 'INSTANT',
      });
    expect(createRes.statusCode).toEqual(201);
    testGame = createRes.body;

    for (const token of [mgrToken, modToken, 'mock_token_player']) {
      const r = await request(app).post(`/api/games/${testGame.id}/join`).set('Authorization', `Bearer ${token}`);
      expect(r.statusCode).toEqual(200);
    }
    // Game is now full (4/4) — this user lands on the waitlist, giving us a non-CONFIRMED target.
    const wlJoin = await request(app).post(`/api/games/${testGame.id}/join`).set('Authorization', `Bearer ${wlToken}`);
    expect(wlJoin.statusCode).toEqual(200);
    const wlParticipation = await prisma.participation.findFirst({ where: { gameId: testGame.id, userId: wlId } });
    expect(wlParticipation.status).toEqual('WAITLISTED');

    // Promote mgrId to MANAGER and modId to MODERATOR via the roles endpoint.
    const promoteMgr = await request(app)
      .post(`/api/games/${testGame.id}/roles`)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ userId: mgrId, role: 'MANAGER' });
    expect(promoteMgr.statusCode).toEqual(200);

    const promoteMod = await request(app)
      .post(`/api/games/${testGame.id}/roles`)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ userId: modId, role: 'MODERATOR' });
    expect(promoteMod.statusCode).toEqual(200);
  });

  afterAll(async () => {
    if (testGame && testGame.id) {
      try {
        await prisma.participation.deleteMany({ where: { gameId: testGame.id } });
        await prisma.gameRole.deleteMany({ where: { gameId: testGame.id } });
        await prisma.chatParticipant.deleteMany({ where: { chatId: testGame.id } });
        await prisma.chatRoom.deleteMany({ where: { id: testGame.id } });
        await prisma.game.delete({ where: { id: testGame.id } });
      } catch (err) {
        console.warn('Clean up of test game skipped:', err.message);
      }
    }
    if (testField && testField.id) {
      try {
        await prisma.field.delete({ where: { id: testField.id } });
      } catch (err) {
        console.warn('Clean up of test field skipped:', err.message);
      }
    }
    await prisma.$disconnect();
  });

  test('a MANAGER can set a lower-level participant as captain', async () => {
    const res = await request(app)
      .patch(`/api/games/${testGame.id}/participants/${plyId}/captain`)
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ isCaptain: true });

    expect(res.statusCode).toEqual(200);
    const participation = await prisma.participation.findFirst({ where: { gameId: testGame.id, userId: plyId } });
    expect(participation.isCaptain).toEqual(true);
  });

  test('a MANAGER can set the organizer as captain (captain carries no management privilege)', async () => {
    const res = await request(app)
      .patch(`/api/games/${testGame.id}/participants/${orgId}/captain`)
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ isCaptain: true });

    expect(res.statusCode).toEqual(200);
    const participation = await prisma.participation.findFirst({ where: { gameId: testGame.id, userId: orgId } });
    expect(participation.isCaptain).toEqual(true);
  });

  test('a MODERATOR can set a MANAGER as captain (no game-management hierarchy applies)', async () => {
    const res = await request(app)
      .patch(`/api/games/${testGame.id}/participants/${mgrId}/captain`)
      .set('Authorization', `Bearer ${modToken}`)
      .send({ isCaptain: true });

    expect(res.statusCode).toEqual(200);
    const participation = await prisma.participation.findFirst({ where: { gameId: testGame.id, userId: mgrId } });
    expect(participation.isCaptain).toEqual(true);
  });

  test('an actor below MODERATOR level cannot use the endpoint at all', async () => {
    const res = await request(app)
      .patch(`/api/games/${testGame.id}/participants/${plyId}/captain`)
      .set('Authorization', `Bearer mock_token_player`)
      .send({ isCaptain: true });

    expect(res.statusCode).toEqual(403);
    expect(res.body.error).toEqual('Not allowed');
  });

  test('a WAITLISTED (non-active) participant cannot be flagged as captain', async () => {
    const res = await request(app)
      .patch(`/api/games/${testGame.id}/participants/${wlId}/captain`)
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ isCaptain: true });

    expect(res.statusCode).toEqual(400);
    expect(res.body.error).toEqual('Target user is not a participant');
  });
});
