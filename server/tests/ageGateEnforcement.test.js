// authenticateToken blocks users who haven't cleared the age gate with 403 AGE_GATE_REQUIRED,
// only while AGE_GATE_ENFORCED=true, and keeps the gate's own routes reachable. No DB: Clerk
// and Prisma are mocked.
const express = require('express');
const request = require('supertest');

const mockFindUnique = jest.fn();

jest.mock('@clerk/backend', () => ({
  createClerkClient: () => ({ users: { getUser: async (id) => ({ id, privateMetadata: {} }) } }),
}));
jest.mock('@clerk/express', () => ({
  requireAuth: () => (req, _res, next) => {
    req.auth = { userId: req.headers['x-test-user'] };
    next();
  },
}));
jest.mock('../lib/prisma', () => ({
  prisma: { user: { findUnique: (...args) => mockFindUnique(...args) } },
}));

const { authenticateToken, invalidateClerkUser } = require('../utils/auth');
const { LEGAL_VERSION } = require('../shared/ageGate');

function buildApp() {
  const app = express();
  const ok = (req, res) => res.json({ id: req.user.id });
  app.get('/api/ping', authenticateToken, ok);
  app.get('/api/users/me', authenticateToken, ok);
  app.post('/api/users/me/age-gate', authenticateToken, ok);
  app.delete('/api/users/me', authenticateToken, ok);
  app.put('/api/users/me', authenticateToken, ok);
  return app;
}

const ROWS = {
  u_nobirth: { deletedAt: null, birthDate: null },
  u_ok: { deletedAt: null, birthDate: new Date('1990-01-01'), termsAcceptedAt: new Date(), termsVersion: LEGAL_VERSION },
};

describe('authenticateToken age gate', () => {
  const ORIGINAL = process.env.AGE_GATE_ENFORCED;

  beforeEach(() => {
    Object.keys(ROWS).forEach(invalidateClerkUser);
    mockFindUnique.mockReset();
    mockFindUnique.mockImplementation(async ({ where }) => ROWS[where.id] || null);
    process.env.AGE_GATE_ENFORCED = 'true';
  });
  afterAll(() => {
    if (ORIGINAL === undefined) delete process.env.AGE_GATE_ENFORCED;
    else process.env.AGE_GATE_ENFORCED = ORIGINAL;
  });

  test('ungated user is blocked with the status', async () => {
    const res = await request(buildApp()).get('/api/ping').set('x-test-user', 'u_nobirth');
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: 'AGE_GATE_REQUIRED', status: 'NEEDS_BIRTHDATE' });
  });

  test.each([
    ['get', '/api/users/me'],
    ['post', '/api/users/me/age-gate'],
    ['delete', '/api/users/me'],
  ])('%s %s stays reachable', async (method, path) => {
    const res = await request(buildApp())[method](path).set('x-test-user', 'u_nobirth');
    expect(res.statusCode).toBe(200);
  });

  test('other methods on /api/users/me are not exempt', async () => {
    const res = await request(buildApp()).put('/api/users/me').set('x-test-user', 'u_nobirth');
    expect(res.statusCode).toBe(403);
  });

  test('user who cleared the gate passes', async () => {
    const res = await request(buildApp()).get('/api/ping').set('x-test-user', 'u_ok');
    expect(res.statusCode).toBe(200);
  });

  test('not enforced unless AGE_GATE_ENFORCED=true', async () => {
    delete process.env.AGE_GATE_ENFORCED;
    const res = await request(buildApp()).get('/api/ping').set('x-test-user', 'u_nobirth');
    expect(res.statusCode).toBe(200);
  });
});
