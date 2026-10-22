import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyApiError, rateLimitCooldownMs } from './apiErrorKind.ts';

test('classifyApiError: 429 vs offline/other', () => {
    assert.equal(classifyApiError({ status: 429 }), 'rateLimited');
    assert.equal(classifyApiError(new TypeError('Network request failed')), 'network');
    assert.equal(classifyApiError({ status: 503 }), 'network');
    assert.equal(classifyApiError(null), 'network');
});

test('rateLimitCooldownMs', () => {
    assert.equal(rateLimitCooldownMs({ status: 429, retryAfterMs: 4000 }), 4000);
    assert.equal(rateLimitCooldownMs({ status: 429 }), 30000);
    assert.equal(rateLimitCooldownMs({ status: 429, retryAfterMs: 0 }), 0);
    assert.equal(rateLimitCooldownMs({ status: 429, retryAfterMs: 9_999_999 }), 300000);
    assert.equal(rateLimitCooldownMs({ status: 429, retryAfterMs: -1 }), 30000);
    assert.equal(rateLimitCooldownMs(null), 0);
    assert.equal(rateLimitCooldownMs({ status: 500, retryAfterMs: 4000 }), 0);
});
