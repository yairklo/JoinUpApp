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

  test('spoofing X-Forwarded-For does not bypass the limiter (keys by req.ip, not the header)', async () => {
    const app = appWithLimiter();
    const r1 = await request(app).get('/ok').set('X-Forwarded-For', '1.1.1.1');
    const r2 = await request(app).get('/ok').set('X-Forwarded-For', '2.2.2.2');
    const r3 = await request(app).get('/ok').set('X-Forwarded-For', '3.3.3.3');
    const blocked = await request(app).get('/ok').set('X-Forwarded-For', '4.4.4.4');
    expect(r1.statusCode).toEqual(200);
    expect(r2.statusCode).toEqual(200);
    expect(r3.statusCode).toEqual(200);
    expect(blocked.statusCode).toEqual(429);
  });

  test('distinct clients behind Cloudflare (distinct CF-Connecting-IP) get separate buckets', async () => {
    const app = appWithLimiter();
    // Same request "shape" (same req.ip since it's all supertest/loopback, same spoofable
    // X-Forwarded-For) but a different Cloudflare-assigned client IP each time — this must not
    // collapse every real visitor onto one shared bucket the way trusting req.ip alone did
    // once Cloudflare sits in front of Render (2 proxy hops, not the 1 `trust proxy` expects).
    for (const ip of ['10.0.0.1', '10.0.0.2', '10.0.0.3', '10.0.0.4', '10.0.0.5']) {
      const res = await request(app).get('/ok').set('CF-Connecting-IP', ip).set('X-Forwarded-For', '9.9.9.9');
      expect(res.statusCode).toEqual(200);
    }
  });

  test('a spoofed CF-Connecting-IP header from the same real client still gets one bucket', async () => {
    const app = appWithLimiter();
    const r1 = await request(app).get('/ok').set('CF-Connecting-IP', '5.5.5.5');
    const r2 = await request(app).get('/ok').set('CF-Connecting-IP', '5.5.5.5');
    const r3 = await request(app).get('/ok').set('CF-Connecting-IP', '5.5.5.5');
    const blocked = await request(app).get('/ok').set('CF-Connecting-IP', '5.5.5.5');
    expect(r1.statusCode).toEqual(200);
    expect(r2.statusCode).toEqual(200);
    expect(r3.statusCode).toEqual(200);
    expect(blocked.statusCode).toEqual(429);
  });
});
