// Tiny key/value store (AppSetting) with a short in-process cache. Reads are hot (every tournament
// request passes the gate), writes are rare admin toggles that invalidate the cache immediately.
// The cache is per-process: after a PUT, other server instances may serve the old value for up to
// TTL_MS (30s) before they re-read the row.
const { prisma } = require('../lib/prisma');

const TTL_MS = 30 * 1000;
const cache = new Map(); // key -> { value, expires }
// Bumped on every invalidation. A read that started before a write must not re-cache its old value
// after the write already cleared the entry.
const versions = new Map(); // key -> number
const versionOf = (key) => versions.get(key) || 0;

async function getSetting(key, defaultValue) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const startedAt = versionOf(key);
  const row = await prisma.appSetting.findUnique({ where: { key } });
  const value = row ? row.value : defaultValue;
  if (versionOf(key) === startedAt) cache.set(key, { value, expires: Date.now() + TTL_MS });
  return value;
}

function invalidateSetting(key) {
  if (key === undefined) {
    for (const k of new Set([...cache.keys(), ...versions.keys()])) versions.set(k, versionOf(k) + 1);
    cache.clear();
    return;
  }
  versions.set(key, versionOf(key) + 1);
  cache.delete(key);
}

async function setSetting(key, value) {
  const row = await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
  invalidateSetting(key);
  return row.value;
}

module.exports = { getSetting, setSetting, invalidateSetting };
