// Tiny key/value store (AppSetting) with a short in-process cache. Reads are hot (every tournament
// request passes the gate), writes are rare admin toggles that invalidate the cache immediately.
// The cache is per-process: after a PUT, other server instances may serve the old value for up to
// TTL_MS (30s) before they re-read the row.
const { prisma } = require('../lib/prisma');

const TTL_MS = 30 * 1000;
const cache = new Map(); // key -> { value, expires }

async function getSetting(key, defaultValue) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const row = await prisma.appSetting.findUnique({ where: { key } });
  const value = row ? row.value : defaultValue;
  cache.set(key, { value, expires: Date.now() + TTL_MS });
  return value;
}

async function setSetting(key, value) {
  const row = await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
  cache.delete(key);
  return row.value;
}

function invalidateSetting(key) {
  if (key === undefined) cache.clear();
  else cache.delete(key);
}

module.exports = { getSetting, setSetting, invalidateSetting };
