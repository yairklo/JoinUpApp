const request = require('supertest');
const express = require('express');
const { createRateLimiter, writeMethodLimiter, readMethodLimiter } = require('../middleware/rateLimit');

// Mirrors the production wiring in index.js: a generous read limiter gates GET/HEAD
// (polling/feed traffic) and a separate, stricter write limiter gates mutations. The two
// are independent buckets (different prefixes) so neither call inflates the other's count.
function appWithLimiter({ readMax = 3, writeMax = 2 } = {}) {
  const app = express();
  app.use(readMethodLimiter(createRateLimiter({ windowMs: 60_000, max: readMax, prefix: 'test-read', forceEnable: true })));
  app.use(writeMethodLimiter(createRateLimiter({ windowMs: 60_000, max: writeMax, prefix: 'test-write', forceEnable: true })));
  app.get('/api/health', (_req, res) => res.json({ status: 'OK' }));
  app.get('/api/socket', (_req, res) => res.json({ ok: true }));
  app.get('/ok', (_req, res) => res.json({ ok: true }));
  app.head('/ok', (_req, res) => res.status(200).end());
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

  test('without Cloudflare, rotating CF-Connecting-IP does not bypass the limiter (keys by req.ip)', async () => {
    const app = appWithLimiter();
    // Production has no Cloudflare in front, so the header is plain client input: a client
    // that rotates it per request must still share one bucket.
    for (const ip of ['10.0.0.1', '10.0.0.2', '10.0.0.3']) {
      expect((await request(app).get('/ok').set('CF-Connecting-IP', ip)).statusCode).toEqual(200);
    }
    const blocked = await request(app).get('/ok').set('CF-Connecting-IP', '10.0.0.4');
    expect(blocked.statusCode).toEqual(429);
  });

  describe('with TRUST_CF_CONNECTING_IP=true (deployment behind Cloudflare)', () => {
    const prev = process.env.TRUST_CF_CONNECTING_IP;
    beforeEach(() => { process.env.TRUST_CF_CONNECTING_IP = 'true'; });
    afterEach(() => {
      if (prev === undefined) delete process.env.TRUST_CF_CONNECTING_IP;
      else process.env.TRUST_CF_CONNECTING_IP = prev;
    });

    test('distinct CF-Connecting-IP values get separate buckets', async () => {
      const app = appWithLimiter();
      // Same req.ip (supertest/loopback) but a different Cloudflare-assigned client IP each
      // time — real visitors behind Cloudflare must not collapse onto one shared bucket.
      for (const ip of ['10.0.0.1', '10.0.0.2', '10.0.0.3', '10.0.0.4', '10.0.0.5']) {
        const res = await request(app).get('/ok').set('CF-Connecting-IP', ip).set('X-Forwarded-For', '9.9.9.9');
        expect(res.statusCode).toEqual(200);
      }
    });

    test('the same CF-Connecting-IP still gets one bucket', async () => {
      const app = appWithLimiter();
      for (let i = 0; i < 3; i++) {
        // eslint-disable-next-line no-await-in-loop
        expect((await request(app).get('/ok').set('CF-Connecting-IP', '5.5.5.5')).statusCode).toEqual(200);
      }
      const blocked = await request(app).get('/ok').set('CF-Connecting-IP', '5.5.5.5');
      expect(blocked.statusCode).toEqual(429);
    });
  });

  test('read and write limiters are independent buckets: exhausting GETs does not block a POST', async () => {
    const app = appWithLimiter({ readMax: 1, writeMax: 5 });
    expect((await request(app).get('/ok')).statusCode).toEqual(200);
    expect((await request(app).get('/ok')).statusCode).toEqual(429); // read bucket exhausted
    expect((await request(app).post('/write')).statusCode).toEqual(200); // write bucket untouched
  });

  test('read and write limiters are independent buckets: exhausting POSTs does not block a GET', async () => {
    const app = appWithLimiter({ readMax: 5, writeMax: 1 });
    expect((await request(app).post('/write')).statusCode).toEqual(200);
    expect((await request(app).post('/write')).statusCode).toEqual(429); // write bucket exhausted
    expect((await request(app).get('/ok')).statusCode).toEqual(200); // read bucket untouched
  });

  test('HEAD requests count toward the read limiter like GET', async () => {
    const app = appWithLimiter({ readMax: 2, writeMax: 5 });
    expect((await request(app).get('/ok')).statusCode).toEqual(200);
    expect((await request(app).head('/ok')).statusCode).toEqual(200);
    expect((await request(app).get('/ok')).statusCode).toEqual(429);
  });

  test('the read GET ceiling is more generous than the old shared global limiter', async () => {
    // Regression guard for the fix itself: polling-heavy interactive use (feed loads,
    // notification-count polling, etc.) must not be starved by a low shared cap.
    const app = appWithLimiter({ readMax: 120, writeMax: 60 });
    for (let i = 0; i < 100; i++) {
      // eslint-disable-next-line no-await-in-loop
      expect((await request(app).get('/ok')).statusCode).toEqual(200);
    }
  });
});

describe('Redis-backed rate limit store (fake client)', () => {
  const { createRedisStore, createMemoryStore } = require('../middleware/rateLimitStore');

  function fakeClient() {
    const counts = new Map();
    return {
      fail: false,
      calls: 0,
      async eval(_lua, _n, key) {
        this.calls += 1;
        if (this.fail) throw new Error('ECONNREFUSED');
        const c = (counts.get(key) || 0) + 1;
        counts.set(key, c);
        return [c, 30_000];
      },
    };
  }

  function app(store, max = 3) {
    const a = express();
    a.use(createRateLimiter({ windowMs: 60_000, max, prefix: 'r', forceEnable: true, store }));
    a.get('/ok', (_req, res) => res.json({ ok: true }));
    return a;
  }

  test('counts via the shared store and derives Retry-After from the TTL', async () => {
    const client = fakeClient();
    const a = app(createRedisStore({ windowMs: 60_000, client }));
    for (let i = 0; i < 3; i++) expect((await request(a).get('/ok')).statusCode).toBe(200);
    const blocked = await request(a).get('/ok');
    expect(blocked.statusCode).toBe(429);
    expect(['30', '31']).toContain(blocked.headers['retry-after']); // TTL 30s (+ a ms of skew)
  });

  test('two apps sharing one store share one budget', async () => {
    const client = fakeClient();
    const a = app(createRedisStore({ windowMs: 60_000, client }));
    const b = app(createRedisStore({ windowMs: 60_000, client }));
    expect((await request(a).get('/ok')).statusCode).toBe(200);
    expect((await request(b).get('/ok')).statusCode).toBe(200);
    expect((await request(a).get('/ok')).statusCode).toBe(200);
    expect((await request(b).get('/ok')).statusCode).toBe(429);
  });

  test('fails open to the memory store and trips the circuit breaker', async () => {
    const client = fakeClient();
    client.fail = true;
    let t = 1_000_000;
    const store = createRedisStore({
      windowMs: 60_000, client, now: () => t, fallback: createMemoryStore({ windowMs: 60_000 }),
    });
    const a = app(store, 100);
    for (let i = 0; i < 3; i++) expect((await request(a).get('/ok')).statusCode).toBe(200);
    expect(client.calls).toBe(3);
    expect(store.breakerOpen).toBe(true);
    await request(a).get('/ok'); // breaker open: Redis not consulted
    expect(client.calls).toBe(3);
    t += 5001; // breaker closes, Redis recovers
    client.fail = false;
    expect((await request(a).get('/ok')).statusCode).toBe(200);
    expect(client.calls).toBe(4);
    expect(store.breakerOpen).toBe(false);
  });

  test('a store that throws never blocks the request', async () => {
    const a = app({ hit: async () => { throw new Error('boom'); } });
    expect((await request(a).get('/ok')).statusCode).toBe(200);
  });
});
