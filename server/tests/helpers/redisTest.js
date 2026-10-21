/**
 * Helpers for Redis-backed tests. These suites only run when TEST_REDIS_URL is set (CI service or
 * `docker run --rm -p 6379:6379 redis:7-alpine` locally). TEST_REDIS_URL is deliberately NOT
 * REDIS_URL: moderationService connects whenever REDIS_URL exists, which would change unrelated tests.
 */
const crypto = require('crypto');
const Redis = require('ioredis');

const TEST_REDIS_URL = process.env.TEST_REDIS_URL || '';
const describeRedis = TEST_REDIS_URL ? describe : describe.skip;

function uniqueId(label = 't') {
  return `jest-${label}-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
}

function newClient(opts = {}) {
  return new Redis(TEST_REDIS_URL, { maxRetriesPerRequest: 2, ...opts });
}

async function deleteByPattern(client, pattern) {
  let cursor = '0';
  do {
    const [next, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
    cursor = next;
    if (keys.length) await client.del(...keys);
  } while (cursor !== '0');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, { timeout = 5000, interval = 25 } = {}) {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeout) throw new Error('waitFor timed out');
    await sleep(interval);
  }
}

module.exports = { TEST_REDIS_URL, describeRedis, uniqueId, newClient, deleteByPattern, sleep, waitFor };
