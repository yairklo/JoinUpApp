// authenticateToken must reject sessions of deleted accounts (tombstoned User.deletedAt) with
// ACCOUNT_DELETED, except for the DELETE /api/users/me retry. No DB, no network: Clerk and Prisma
// are mocked.
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

const { authenticateToken, clearClerkUserCache, invalidateClerkUser } = require('../utils/auth');

function buildApp() {
  const app = express();
  app.get('/api/ping', authenticateToken, (req, res) => res.json({ id: req.user.id }));
  app.delete('/api/users/me', authenticateToken, (req, res) => res.json({ ok: true }));
  return app;
}

describe('authenticateToken and deleted accounts', () => {
  beforeEach(() => {
    clearClerkUserCache();
    invalidateClerkUser('u_deleted');
    invalidateClerkUser('u_live');
    mockFindUnique.mockReset();
    mockFindUnique.mockImplementation(async ({ where }) =>
      where.id === 'u_deleted' ? { deletedAt: new Date() } : { deletedAt: null });
  });

  test('deleted account gets 403 ACCOUNT_DELETED', async () => {
    const res = await request(buildApp()).get('/api/ping').set('x-test-user', 'u_deleted');
    expect(res.statusCode).toEqual(403);
    expect(res.body.code).toEqual('ACCOUNT_DELETED');
  });

  test('DELETE /api/users/me is still reachable so a failed deletion can be retried', async () => {
    const res = await request(buildApp()).delete('/api/users/me').set('x-test-user', 'u_deleted');
    expect(res.statusCode).toEqual(200);
  });

  test('live account passes', async () => {
    const res = await request(buildApp()).get('/api/ping').set('x-test-user', 'u_live');
    expect(res.statusCode).toEqual(200);
    expect(res.body.id).toEqual('u_live');
  });

  test('a DB failure fails open rather than locking everyone out', async () => {
    mockFindUnique.mockRejectedValue(new Error('db down'));
    const res = await request(buildApp()).get('/api/ping').set('x-test-user', 'u_live');
    expect(res.statusCode).toEqual(200);
  });
});
