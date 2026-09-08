const request = require('supertest');

jest.setTimeout(30000);

jest.mock('../utils/auth', () => ({
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    req.user = { id: 'user_cities_top', name: 'CitiesTop', isAdmin: false };
    return next();
  },
  attachOptionalUser: (_req, _res, next) => next(),
}));

jest.mock('../workers/reviewWorker', () => ({
  processReviewQueue: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../workers/cleanupWorker', () => ({
  startCleanupWorker: jest.fn(),
}));

const { app } = require('../index');

describe('GET /api/fields/cities/top', () => {
  test('is public and returns { city: string | null }', async () => {
    const res = await request(app).get('/api/fields/cities/top');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        city: res.body.city === null ? null : expect.any(String),
      })
    );
    if (res.body.city != null) {
      expect(res.body.city.length).toBeGreaterThan(0);
    }
  });
});
