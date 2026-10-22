import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRetryAfterMs } from './retryAfter.ts';
import { retryAfterMs } from './readBackoff.ts';

const now = Date.parse('2026-01-01T00:00:00Z');
const FB = 30_000;

test('parseRetryAfterMs table', () => {
    const rows = [
        ['7', 7000],
        [' 7 ', 7000],
        ['1.5', 1500],
        ['0', 0],
        [null, FB],
        [undefined, FB],
        ['', FB],
        ['   ', FB],
        ['abc', FB],
        ['NaN', FB],
        ['Infinity', FB],
        ['-5', FB],
        ['99999', 300_000],
        ['300', 300_000],
        ['Thu, 01 Jan 2026 00:00:12 GMT', 12_000],
        ['Wed, 31 Dec 2025 23:59:00 GMT', 0],
        ['Thu, 01 Jan 2026 00:00:00 GMT', 0],
        ['Fri, 01 Jan 2027 00:00:00 GMT', 300_000],
    ];
    for (const [header, want] of rows) assert.equal(parseRetryAfterMs(header, { now }), want, String(header));
});

test('parseRetryAfterMs honours custom fallback and cap', () => {
    assert.equal(parseRetryAfterMs('60', { fallbackMs: 2000, maxMs: 10_000 }), 10_000);
    assert.equal(parseRetryAfterMs('x', { fallbackMs: 2000, maxMs: 10_000 }), 2000);
    assert.equal(parseRetryAfterMs('0', { fallbackMs: 2000, maxMs: 10_000 }), 0);
});

test('GET read backoff: 1s fallback, 250ms floor, 5s cap', () => {
    assert.equal(retryAfterMs(null), 1000);
    assert.equal(retryAfterMs('garbage'), 1000);
    assert.equal(retryAfterMs('0'), 250);
    assert.equal(retryAfterMs('2'), 2000);
    assert.equal(retryAfterMs('60'), 5000);
    assert.equal(retryAfterMs('Wed, 31 Dec 2025 23:59:00 GMT', now), 250);
});
