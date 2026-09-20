const express = require('express');
const request = require('supertest');

// Clerk's requireAuth answers an unauthenticated request with response.redirect(signInUrl).
jest.mock('@clerk/express', () => ({
  requireAuth: () => (req, res, next) => {
    if (req.headers['x-test-user']) {
      req.auth = { userId: req.headers['x-test-user'] };
      return next();
    }
    return res.redirect('/');
  },
}));
jest.mock('@clerk/backend', () => ({
  createClerkClient: () => ({
    users: { getUser: async (id) => ({ firstName: 'T', lastName: id, emailAddresses: [], imageUrl: null }) },
  }),
}));

const { authenticateToken } = require('../utils/auth');

describe('authenticateToken without credentials', () => {
  const app = express();
  app.get('/protected', authenticateToken, (req, res) => res.json({ ok: true, id: req.user.id }));
  app.get('/elsewhere', (req, res) => res.redirect('/landing'));

  test('answers 401 JSON instead of a 302 redirect to the sign-in URL', async () => {
    const res = await request(app).get('/protected').set('Accept', 'application/json');
    expect(res.statusCode).toEqual(401);
    expect(res.headers.location).toBeUndefined();
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  test('still lets an authenticated request through', async () => {
    const res = await request(app).get('/protected').set('x-test-user', 'user_1');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ ok: true, id: 'user_1' });
  });

  test('does not disturb res.redirect on other routes', async () => {
    const res = await request(app).get('/elsewhere');
    expect(res.statusCode).toEqual(302);
    expect(res.headers.location).toEqual('/landing');
  });
});
