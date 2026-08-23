const request = require('supertest');
const express = require('express');
const { createRateLimiter, writeMethodLimiter } = require('../middleware/rateLimit');

function appWithLimiter() {
  const app = express();
  app.use(createRateLimiter({ windowMs: 60_000, max: 3, prefix: 'test-global', forceEnable: true }));
  app.use(writeMethodLimiter(createRateLimiter({ windowMs: 60_000, max: 2, prefix: 'test-write', forceEnable: true })));
  app.get('/api/health', (_req, res) => res.json({ status: 'OK' }));
  app.get('/api/socket', (_req, res) => res.json({ ok: true }));
  app.get('/ok', (_req, res) => res.json({ ok: true }));
  app.post('/write', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('HTTP rate limiter', () => {
  test('allows requests under the cap and 429s after', async () => {
    const app = appWithLimiter();
    expect((await request(app).get('/ok')).statusCode).toEqual(200);
    expect((await request(app).get('/ok')).statusCode).toEqual(200);
    expect((await request(app).get('/ok')).statusCode).toEqual(200);
    const blocked = await request(app).get('/ok');
    expect(blocked.statusCode).toEqual(429);
    expect(blocked.body.error).toEqual('Too many requests');
  });

  test('does not rate-limit /api/health', async () => {
    const app = appWithLimiter();
    await request(app).get('/ok');
    await request(app).get('/ok');
    await request(app).get('/ok');
    const health = await request(app).get('/api/health');
    expect(health.statusCode).toEqual(200);
  });

  test('write limiter is stricter than GET', async () => {
    const app = appWithLimiter();
    expect((await request(app).post('/write')).statusCode).toEqual(200);
    expect((await request(app).post('/write')).statusCode).toEqual(200);
    expect((await request(app).post('/write')).statusCode).toEqual(429);
  });

  test('does not rate-limit Socket.IO polling', async () => {
    const app = appWithLimiter();
    await request(app).get('/ok');
    await request(app).get('/ok');
    await request(app).get('/ok');
    const sock = await request(app).get('/api/socket');
    expect(sock.statusCode).toEqual(200);
  });
});
