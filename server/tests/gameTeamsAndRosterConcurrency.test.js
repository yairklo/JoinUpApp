const request = require('supertest');

jest.setTimeout(60000);

jest.mock('../socket/adapter', () => ({ attachSocketAdapter: jest.fn() }));

const mockUsers = {
  mock_token_organizer: { id: 'gt_org', name: 'Organizer' },
  mock_token_manager: { id: 'gt_mgr', name: 'Manager' },
  mock_token_player: { id: 'gt_ply', name: 'Player' },
  mock_token_outsider: { id: 'gt_out', name: 'Outsider' },
  mock_token_joiner1: { id: 'gt_j1', name: 'Joiner 1' },
  mock_token_joiner2: { id: 'gt_j2', name: 'Joiner 2' },
};

jest.mock('../utils/auth', () => ({
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token || !mockUsers[token]) return res.status(401).json({ error: 'Unauthorized' });
    req.user = mockUsers[token];
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

const orgToken = 'mock_token_organizer';
const mgrToken = 'mock_token_manager';
const plyToken = 'mock_token_player';
const outToken = 'mock_token_outsider';
const j1Token = 'mock_token_joiner1';
const j2Token = 'mock_token_joiner2';

const as = (token) => ({ Authorization: `Bearer ${token}` });

describe('server/routes/gameTeams.js PUT /:id/teams permissions & gameRoster concurrency', () => {
  let testField;
  let testGame;

  beforeAll(async () => {
    // Upsert users
    for (const u of Object.values(mockUsers)) {
      await prisma.user.upsert({
        where: { id: u.id },
        update: {},
        create: { id: u.id, name: u.name, imageUrl: null },
      });
    }

    testField = await prisma.field.create({
      data: {
        name: 'מגרש בדיקה - gameTeams',
        location: 'רחוב הבדיקות 2',
        city: 'תל אביב',
        price: 0,
        rating: 5,
        available: true,
        type: 'OPEN',
      },
    });
  });

  afterAll(async () => {
    const userIds = Object.values(mockUsers).map((u) => u.id);
    const games = await prisma.game.findMany({ where: { organizerId: 'gt_org' }, select: { id: true } });
    const gIds = games.map((g) => g.id);
    if (gIds.length) {
      await prisma.chatParticipant.deleteMany({ where: { chatId: { in: gIds } } });
      await prisma.chatRoom.deleteMany({ where: { id: { in: gIds } } });
      await prisma.team.deleteMany({ where: { gameId: { in: gIds } } });
      await prisma.participation.deleteMany({ where: { gameId: { in: gIds } } });
      await prisma.gameRole.deleteMany({ where: { gameId: { in: gIds } } });
      await prisma.game.deleteMany({ where: { id: { in: gIds } } });
    }
    await prisma.field.deleteMany({ where: { id: testField.id } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  describe('PUT /api/games/:id/teams permissions', () => {
    beforeAll(async () => {
      // Create game with organizer, add manager and regular player
      const res = await request(app)
        .post('/api/games')
        .set(as(orgToken))
        .send({
          title: 'משחק בדיקת קבוצות',
          maxPlayers: 10,
          fieldId: testField.id,
          start: new Date(Date.now() + 864e5).toISOString(),
          duration: 1,
          sport: 'SOCCER',
          isOpenToJoin: true,
          joinPolicy: 'INSTANT',
        });
      expect(res.statusCode).toBe(201);
      testGame = res.body;

      // Join manager and player
      await request(app).post(`/api/games/${testGame.id}/join`).set(as(mgrToken));
      await request(app).post(`/api/games/${testGame.id}/join`).set(as(plyToken));

      // Promote mgr to MANAGER role
      await prisma.gameRole.create({
        data: { gameId: testGame.id, userId: 'gt_mgr', role: 'MANAGER' },
      });
    });

    const teamsPayload = {
      teams: [
        { name: 'קבוצה א', color: '#ff0000', playerIds: ['gt_org', 'gt_mgr'] },
        { name: 'קבוצה ב', color: '#0000ff', playerIds: ['gt_ply'] },
      ],
    };

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).put(`/api/games/${testGame.id}/teams`).send(teamsPayload);
      expect(res.statusCode).toBe(401);
    });

    it('rejects non-member / outsider with 403', async () => {
      const res = await request(app)
        .put(`/api/games/${testGame.id}/teams`)
        .set(as(outToken))
        .send(teamsPayload);
      expect(res.statusCode).toBe(403);
      expect(res.body.error).toBe('Not allowed');
    });

    it('rejects regular player (non-manager) with 403', async () => {
      const res = await request(app)
        .put(`/api/games/${testGame.id}/teams`)
        .set(as(plyToken))
        .send(teamsPayload);
      expect(res.statusCode).toBe(403);
      expect(res.body.error).toBe('Not allowed');
    });

    it('allows manager / captain to update teams with 200', async () => {
      const res = await request(app)
        .put(`/api/games/${testGame.id}/teams`)
        .set(as(mgrToken))
        .send(teamsPayload);
      expect(res.statusCode).toBe(200);
      expect(res.body.teams).toHaveLength(2);
    });

    it('allows organizer to update teams with 200', async () => {
      const res = await request(app)
        .put(`/api/games/${testGame.id}/teams`)
        .set(as(orgToken))
        .send({
          teams: [
            { name: 'לבנים', color: '#ffffff', playerIds: ['gt_org'] },
            { name: 'שחורים', color: '#000000', playerIds: ['gt_mgr', 'gt_ply'] },
          ],
        });
      expect(res.statusCode).toBe(200);
      expect(res.body.teams).toHaveLength(2);
      expect(res.body.teams[0].name).toBe('לבנים');
    });
  });

  describe('gameRoster concurrent joins at capacity (no overbooking)', () => {
    let capacityGame;

    beforeEach(async () => {
      // Create game with maxPlayers = 2
      // Organizer is 1 confirmed player. That leaves exactly 1 remaining spot!
      const res = await request(app)
        .post('/api/games')
        .set(as(orgToken))
        .send({
          title: 'משחק קיבולת תחרותית',
          maxPlayers: 2,
          fieldId: testField.id,
          start: new Date(Date.now() + 864e5).toISOString(),
          duration: 1,
          sport: 'SOCCER',
          isOpenToJoin: true,
          joinPolicy: 'INSTANT',
        });
      expect(res.statusCode).toBe(201);
      capacityGame = res.body;

      // Clean participations for joiners if any
      await prisma.participation.deleteMany({
        where: { gameId: capacityGame.id, userId: { in: ['gt_j1', 'gt_j2'] } },
      });
    });

    it('never overbooks: exactly 1 player is CONFIRMED and the other is WAITLISTED', async () => {
      // Confirm pre-state: 1 confirmed (organizer)
      const confirmedBefore = await prisma.participation.count({
        where: { gameId: capacityGame.id, status: 'CONFIRMED' },
      });
      expect(confirmedBefore).toBe(1);

      // Fire 2 concurrent join requests from j1 and j2
      const [res1, res2] = await Promise.all([
        request(app).post(`/api/games/${capacityGame.id}/join`).set(as(j1Token)),
        request(app).post(`/api/games/${capacityGame.id}/join`).set(as(j2Token)),
      ]);

      expect(res1.statusCode).toBe(200);
      expect(res2.statusCode).toBe(200);

      // Verify that confirmed count never exceeds maxPlayers (2)
      const confirmedAfter = await prisma.participation.count({
        where: { gameId: capacityGame.id, status: 'CONFIRMED' },
      });
      const waitlistedAfter = await prisma.participation.count({
        where: { gameId: capacityGame.id, status: 'WAITLISTED' },
      });

      // Assert no overbooking: exactly 2 confirmed, 1 waitlisted
      expect(confirmedAfter).toBe(2);
      expect(waitlistedAfter).toBe(1);
    });

    it('reuses a NOT_SELECTED row when a seat is free', async () => {
      await prisma.participation.create({
        data: { gameId: capacityGame.id, userId: 'gt_j1', status: 'NOT_SELECTED' },
      });
      const res = await request(app).post(`/api/games/${capacityGame.id}/join`).set(as(j1Token));
      expect(res.statusCode).toBe(200);
      const row = await prisma.participation.findUnique({
        where: { gameId_userId: { gameId: capacityGame.id, userId: 'gt_j1' } },
      });
      expect(row.status).toBe('CONFIRMED');
    });

    it('waitlists a NOT_SELECTED player when the game is already full', async () => {
      await prisma.participation.create({
        data: { gameId: capacityGame.id, userId: 'gt_j2', status: 'CONFIRMED' },
      });
      await prisma.participation.create({
        data: { gameId: capacityGame.id, userId: 'gt_j1', status: 'NOT_SELECTED' },
      });
      const res = await request(app).post(`/api/games/${capacityGame.id}/join`).set(as(j1Token));
      expect(res.statusCode).toBe(200);
      const row = await prisma.participation.findUnique({
        where: { gameId_userId: { gameId: capacityGame.id, userId: 'gt_j1' } },
      });
      expect(row.status).toBe('WAITLISTED');
      const confirmed = await prisma.participation.count({
        where: { gameId: capacityGame.id, status: 'CONFIRMED' },
      });
      expect(confirmed).toBe(2);
    });
  });
});
