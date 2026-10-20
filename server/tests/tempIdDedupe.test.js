const { createTempIdDedupe } = require('../utils/tempIdDedupe');

function fakeRedis() {
  const m = new Map();
  return {
    fail: false,
    async set(k, v, _px, _ttl, nx) {
      if (this.fail) throw new Error('down');
      if (nx === 'NX' && m.has(k)) return null;
      m.set(k, v);
      return 'OK';
    },
    async get(k) { if (this.fail) throw new Error('down'); return m.has(k) ? m.get(k) : null; },
    async del(k) { if (this.fail) throw new Error('down'); m.delete(k); return 1; },
  };
}

describe('tempId dedupe (local)', () => {
  test('first claim wins, second sees in-flight (echo null)', async () => {
    const d = createTempIdDedupe();
    expect(await d.claim('k')).toEqual({ claimed: true });
    expect(await d.claim('k')).toEqual({ claimed: false, echo: null });
  });

  test('stored echo is returned to later claims', async () => {
    const d = createTempIdDedupe();
    await d.claim('k');
    await d.storeEcho('k', { id: 1 });
    expect(await d.claim('k')).toEqual({ claimed: false, echo: { id: 1 } });
  });

  test('release frees the slot for a retry', async () => {
    const d = createTempIdDedupe();
    await d.claim('k');
    await d.release('k');
    expect(await d.claim('k')).toEqual({ claimed: true });
  });

  test('entries expire after the TTL', async () => {
    const d = createTempIdDedupe({ ttlMs: 1000 });
    await d.claim('k', 0);
    expect(await d.claim('k', 1001)).toEqual({ claimed: true });
  });
});

describe('tempId dedupe (Redis shared across instances)', () => {
  test('a retry on ANOTHER instance sees the first instance claim and echo', async () => {
    const client = fakeRedis();
    const a = createTempIdDedupe({ client });
    const b = createTempIdDedupe({ client });
    expect(await a.claim('k')).toEqual({ claimed: true });
    expect(await b.claim('k')).toEqual({ claimed: false, echo: null });
    const b2 = createTempIdDedupe({ client });
    await a.storeEcho('k', { id: 7, text: 'hi' });
    expect(await b2.claim('k')).toEqual({ claimed: false, echo: { id: 7, text: 'hi' } });
  });

  test('release clears the shared claim', async () => {
    const client = fakeRedis();
    const a = createTempIdDedupe({ client });
    const b = createTempIdDedupe({ client });
    await a.claim('k');
    await a.release('k');
    expect(await b.claim('k')).toEqual({ claimed: true });
  });

  test('Redis failure falls back to the local map without throwing', async () => {
    const client = fakeRedis();
    client.fail = true;
    const d = createTempIdDedupe({ client });
    expect(await d.claim('k')).toEqual({ claimed: true });
    expect(await d.claim('k')).toEqual({ claimed: false, echo: null });
    await expect(d.storeEcho('k', { id: 1 })).resolves.toBeUndefined();
    await expect(d.release('k')).resolves.toBeUndefined();
  });
});
