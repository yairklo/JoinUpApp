import test from 'node:test';
import assert from 'node:assert/strict';
import { withRequestTimeout, fetchUploadWithRetry } from './requestTimeout.ts';

const resp = (status, retryAfter) => ({ status, ok: status < 400, headers: { get: () => retryAfter ?? null } });

test('timeout aborts the signal, flags didTimeout, and cleanup is safe', async () => {
    const t = withRequestTimeout(undefined, 10);
    await new Promise((r) => t.signal.addEventListener('abort', r));
    assert.equal(t.didTimeout(), true);
    t.cleanup();
});

test('cleanup before the deadline clears the timer (no late abort)', async () => {
    const t = withRequestTimeout(undefined, 20);
    t.cleanup();
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(t.signal.aborted, false);
    assert.equal(t.didTimeout(), false);
});

test('user abort propagates and is not reported as a timeout', () => {
    const user = new AbortController();
    const t = withRequestTimeout(user.signal, 60_000);
    user.abort();
    assert.equal(t.signal.aborted, true);
    assert.equal(t.didTimeout(), false);
    t.cleanup();
});

test('already-aborted user signal aborts immediately', () => {
    const user = new AbortController();
    user.abort();
    const t = withRequestTimeout(user.signal, 60_000);
    assert.equal(t.signal.aborted, true);
    assert.equal(t.didTimeout(), false);
    t.cleanup();
});

test('timeout aborts a pending fetch', async () => {
    const t = withRequestTimeout(undefined, 10);
    const hang = (signal) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(new Error('aborted'))));
    await assert.rejects(fetchUploadWithRetry(hang, t.signal, async () => {}), /aborted/);
    assert.equal(t.didTimeout(), true);
    t.cleanup();
});

test('429 then 200: exactly one retry, waits Retry-After', async () => {
    const seq = [resp(429, '3'), resp(200)];
    const waits = [];
    let calls = 0;
    const res = await fetchUploadWithRetry(async () => seq[calls++], new AbortController().signal, async (ms) => waits.push(ms));
    assert.equal(res.status, 200);
    assert.equal(calls, 2);
    assert.deepEqual(waits, [3000]);
});

test('429 then 429: second 429 is returned, no third attempt', async () => {
    let calls = 0;
    const res = await fetchUploadWithRetry(async () => (calls++, resp(429, '0')), new AbortController().signal, async () => {});
    assert.equal(res.status, 429);
    assert.equal(calls, 2);
});

test('non-429 errors are not retried', async () => {
    let calls = 0;
    const res = await fetchUploadWithRetry(async () => (calls++, resp(500)), new AbortController().signal, async () => {});
    assert.equal(res.status, 500);
    assert.equal(calls, 1);
});

test('abort during the 429 wait rethrows AbortError and sends no second request', async () => {
    const user = new AbortController();
    const t = withRequestTimeout(user.signal, 60_000);
    let calls = 0;
    const p = fetchUploadWithRetry(async () => (calls++, resp(429, '5')), t.signal);
    setTimeout(() => user.abort(), 10);
    await assert.rejects(p, (e) => e.name === 'AbortError');
    assert.equal(calls, 1);
    assert.equal(t.didTimeout(), false);
    t.cleanup();
});
