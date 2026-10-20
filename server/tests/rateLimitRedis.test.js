/**
 * Cross-instance rate limiting on a real Redis (skipped without TEST_REDIS_URL).
 * "Instance" = an independent Express app + limiter object, as two API containers would be.
 */
const request = require('supertest');
const express = require('express');
const { createRateLimiter } = require('../middleware/rateLimit');
const { createRedisStore, createMemoryStore } = require('../middleware/rateLimitStore');
const { createSendRateLimiter } = require('../services/chatSafety');
const { createTempIdDedupe } = require('../utils/tempIdDedupe');
const { describeRedis, newClient, uniqueId, deleteByPattern, sleep } = require('./helpers/redisTest');

function appWith(store, max) {
  const a = express();
  a.use(createRateLimiter({ windowMs: 60_000, max, prefix: 'rl', forceEnable: true, store }));
  a.get('/ok', (_req, res) => res.json({ ok: true }));
  return a;
}

describeRedis('rate limiting and chat dedupe shared across instances (real Redis)', () => {
  let client;
  const run = uniqueId('rl');

  beforeAll(() => { client = newClient(); });
  afterAll(async () => {
    await deleteByPattern(client, '*jest-*');
    client.disconnect();
  });

  test('HTTP limit is global across two apps (memory control only trips at 2x)', async () => {
    // The limiter key is the client IP, so make it unique per run.
    const storeA = createRedisStore({ windowMs: 60_000, client });
    const storeB = createRedisStore({ windowMs: 60_000, client });
    const a = appWith(storeA, 3);
    const b = appWith(storeB, 3);
    const ip = `10.${Math.floor(Math.random() * 200)}.0.1`;
    const get = (app) => request(app).get('/ok').set('X-Forwarded-For', ip);
    // supertest connects from loopback; req.ip is the socket address unless trust proxy is set.
    a.set('trust proxy', 1);
    b.set('trust proxy', 1);

    const codes = [];
    for (const app of [a, b, a, b]) codes.push((await get(app)).statusCode);
    expect(codes).toEqual([200, 200, 200, 429]);

    // Control: two memory stores each allow 3, so the same 4 alternating requests all pass.
    const ma = appWith(createMemoryStore({ windowMs: 60_000 }), 3);
    const mb = appWith(createMemoryStore({ windowMs: 60_000 }), 3);
    const ip2 = `11.${Math.floor(Math.random() * 200)}.0.1`;
    ma.set('trust proxy', 1);
    mb.set('trust proxy', 1);
    const mcodes = [];
    for (const app of [ma, mb, ma, mb]) mcodes.push((await request(app).get('/ok').set('X-Forwarded-For', ip2)).statusCode);
    expect(mcodes).toEqual([200, 200, 200, 200]);
  });

  test('Retry-After comes from the Redis TTL and the window expires', async () => {
    const store = createRedisStore({ windowMs: 700, client });
    const a = appWith(store, 1);
    a.set('trust proxy', 1);
    const ip = `12.${Math.floor(Math.random() * 200)}.0.1`;
    expect((await request(a).get('/ok').set('X-Forwarded-For', ip)).statusCode).toBe(200);
    const blocked = await request(a).get('/ok').set('X-Forwarded-For', ip);
    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    await sleep(800);
    expect((await request(a).get('/ok').set('X-Forwarded-For', ip)).statusCode).toBe(200);
  });

  test('chat send limiter: 10 allowed in total across two instances, the 11th is denied', async () => {
    const user = `${run}-u`;
    const a = createSendRateLimiter({ windowMs: 10_000, max: 10, client });
    const b = createSendRateLimiter({ windowMs: 10_000, max: 10, client });
    const results = [];
    for (let i = 0; i < 11; i++) results.push(await (i % 2 ? b : a).allow(user));
    expect(results.slice(0, 10).every(Boolean)).toBe(true);
    expect(results[10]).toBe(false);
    // Another user is unaffected.
    expect(await a.allow(`${run}-other`)).toBe(true);
  });

  test('chat send limiter window slides (short window)', async () => {
    const user = `${run}-slide`;
    const a = createSendRateLimiter({ windowMs: 400, max: 2, client });
    expect(await a.allow(user)).toBe(true);
    expect(await a.allow(user)).toBe(true);
    expect(await a.allow(user)).toBe(false);
    await sleep(500);
    expect(await a.allow(user)).toBe(true);
  });

  test('tempId dedupe is shared: a retry on another instance is not stored twice', async () => {
    const a = createTempIdDedupe({ client });
    const b = createTempIdDedupe({ client });
    const key = `${run}:room:tmp1`;
    expect((await a.claim(key)).claimed).toBe(true);
    expect(await b.claim(key)).toEqual({ claimed: false, echo: null });
    await a.storeEcho(key, { id: 'm1', text: 'hello' });
    const c = createTempIdDedupe({ client });
    expect(await c.claim(key)).toEqual({ claimed: false, echo: { id: 'm1', text: 'hello' } });
    await a.release(key);
    expect((await createTempIdDedupe({ client }).claim(key)).claimed).toBe(true);
  });
});
