import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadRetryDelayMs, shouldRetryUpload, UPLOAD_TIMEOUT_MS } from './uploadPolicy.ts';

test('uploadRetryDelayMs: header capped to 10s, fallback 2s', () => {
    assert.equal(uploadRetryDelayMs('3'), 3000);
    assert.equal(uploadRetryDelayMs('60'), 10000);
    assert.equal(uploadRetryDelayMs(undefined), 2000);
    assert.equal(uploadRetryDelayMs('garbage'), 2000);
    assert.equal(uploadRetryDelayMs('-5'), 2000);
    const now = Date.parse('2026-01-01T00:00:00Z');
    assert.equal(uploadRetryDelayMs('Thu, 01 Jan 2026 00:00:04 GMT', now), 4000);
});

test('shouldRetryUpload: only first 429', () => {
    assert.equal(shouldRetryUpload(429, 0), true);
    assert.equal(shouldRetryUpload(429, 1), false);
    for (const s of [400, 401, 500, 502, 503]) assert.equal(shouldRetryUpload(s, 0), false);
});

test('default timeout is 30s', () => assert.equal(UPLOAD_TIMEOUT_MS, 30000));
