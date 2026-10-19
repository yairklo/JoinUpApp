/**
 * GET /api/games/:id/pick-session authorization (mocked Prisma, no DB): organizer, game-role
 * MANAGER/CAPTAIN and captain participants may load it; a plain player gets 403 and never
 * triggers the state build (which self-heals/writes).
 */
const express = require('express');
const request = require('supertest');

const mockFindUnique = jest.fn();

jest.mock('../utils/auth', () => ({
  authenticateToken: (req, res, next) => {
    const uid = req.headers['x-test-user'];
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    req.user = { id: uid };
    return next();
  },
}));
jest.mock('../services/gameService', () => ({
  prisma: { game: { findUnique: (...a) => mockFindUnique(...a) } },
  ROLE_LEVEL: {},
  getRoleLevel: jest.fn(),
  mapGameForClient: jest.fn(),
  broadcastGameUpdate: jest.fn(),
}));
jest.mock('../services/gameScheduler', () => ({}));

const mockBuildState = jest.fn();
jest.mock('../services/pickSessionService', () => ({
  ...jest.requireActual('../services/pickSessionService'),
  buildPickSessionState: (...a) => mockBuildState(...a),
}));

const router = require('../routes/gamePickSession');
const { canAccessPickSession } = require('../services/pickSessionService');

const game = {
  organizerId: 'org',
  roles: [
    { userId: 'mgr', role: 'MANAGER' },
    { userId: 'mod', role: 'MODERATOR' },
  ],
  participants: [{ userId: 'capPlayer' }],
};

const app = express();
app.use(express.json());
app.use('/api/games', router);

beforeEach(() => {
  mockFindUnique.mockReset().mockResolvedValue(game);
  mockBuildState.mockReset().mockResolvedValue({ ok: true });
});

describe('GET /api/games/:id/pick-session', () => {
  test.each(['org', 'mgr', 'capPlayer'])('%s is allowed', async (uid) => {
    const res = await request(app).get('/api/games/g1/pick-session').set('x-test-user', uid);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  test.each(['player', 'mod'])('%s gets 403 and no state build', async (uid) => {
    const res = await request(app).get('/api/games/g1/pick-session').set('x-test-user', uid);
    expect(res.status).toBe(403);
    expect(mockBuildState).not.toHaveBeenCalled();
  });

  test('unknown game is 403', async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/games/nope/pick-session').set('x-test-user', 'org');
    expect(res.status).toBe(403);
  });
});

describe('canAccessPickSession (shared by the joinPickSession socket handler)', () => {
  test('matches the REST rule', async () => {
    expect(await canAccessPickSession('g1', 'mgr')).toBe(true);
    expect(await canAccessPickSession('g1', 'player')).toBe(false);
  });
});
