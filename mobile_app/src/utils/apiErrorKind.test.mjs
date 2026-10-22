import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRetryAfterMs, classifyApiError, rateLimitCooldownMs } from './apiErrorKind.ts';

test('parseRetryAfterMs: seconds, date, fallback, cap', () => {
    assert.equal(parseRetryAfterMs('7'), 7000);
    assert.equal(parseRetryAfterMs(null), 30000);
    assert.equal(parseRetryAfterMs('abc'), 30000);
    assert.equal(parseRetryAfterMs('0'), 30000);
    assert.equal(parseRetryAfterMs('99999'), 300000);
    const now = Date.parse('2026-01-01T00:00:00Z');
    assert.equal(parseRetryAfterMs('Thu, 01 Jan 2026 00:00:12 GMT', 30000, 300000, now), 12000);
});

test('classifyApiError: 429 vs offline/other', () => {
    assert.equal(classifyApiError({ status: 429 }), 'rateLimited');
    assert.equal(classifyApiError(new TypeError('Network request failed')), 'network');
    assert.equal(classifyApiError({ status: 503 }), 'network');
    assert.equal(classifyApiError(null), 'network');
});

test('rateLimitCooldownMs', () => {
    assert.equal(rateLimitCooldownMs({ status: 429, retryAfterMs: 4000 }), 4000);
    assert.equal(rateLimitCooldownMs({ status: 429 }), 30000);
    assert.equal(rateLimitCooldownMs({ status: 500, retryAfterMs: 4000 }), 0);
});
