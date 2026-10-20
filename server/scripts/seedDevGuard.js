/**
 * Refuses to seed when the environment looks like production.
 * Hard stops (no override): live Clerk keys, a prod-looking database host or
 * name, DATABASE_URL equal to PROD_DATABASE_URL, or PUBLIC_SERVER_URL pointing
 * at the production API. A Neon host that does not itself say "dev" is allowed
 * only with JOINUP_SEED_CONFIRM=dev and an sk_test_ key.
 */

const PROD_API_HOST = 'joinup-api.duckdns.org';

function stripSecret(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function hostOf(databaseUrl) {
  const match = String(databaseUrl || '').match(/@([^/?]+)/);
  if (!match) return '';
  // Neon can list host:port. Drop userinfo that slipped through.
  return match[1].split(',')[0].trim().toLowerCase();
}

function databaseNameOf(databaseUrl) {
  const match = String(databaseUrl || '').match(/@[^/]+\/([^?]+)/);
  if (!match) return '';
  return decodeURIComponent(match[1]).toLowerCase();
}

function looksLikeProdToken(value) {
  return /(^|[.\-_])prod(uction)?([.\-_]|$)/i.test(String(value || ''));
}

function isRecognizedDevHost(host) {
  if (!host) return false;
  const bare = host.replace(/:\d+$/, '');
  if (bare === 'localhost' || bare === '127.0.0.1' || bare === '0.0.0.0' || bare.endsWith('.local')) {
    return true;
  }
  return /(dev|preview|staging|test|branch|ci)/i.test(bare);
}

function publicHost(url) {
  if (!url) return '';
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function clerkKeys(env) {
  return [
    env.CLERK_SECRET_KEY,
    env.CLERK_PUBLISHABLE_KEY,
    env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  ].filter((value) => typeof value === 'string' && value.length > 0);
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {string[]} human-readable reasons. Empty means the guard passes.
 */
function seedRefusalReasons(env) {
  const reasons = [];
  const databaseUrl = env.DATABASE_URL || '';
  if (!databaseUrl.trim()) reasons.push('DATABASE_URL is missing');

  const keys = clerkKeys(env);
  if (keys.some((key) => key.startsWith('sk_live_') || key.startsWith('pk_live_'))) {
    reasons.push('a Clerk live key is set (pk_live_ / sk_live_)');
  }

  const secret = env.CLERK_SECRET_KEY || '';
  if (!secret) {
    reasons.push('CLERK_SECRET_KEY is missing (dev seed needs an sk_test_ key)');
  } else if (!secret.startsWith('sk_test_')) {
    reasons.push('CLERK_SECRET_KEY must be a test key (sk_test_)');
  }

  if (env.PROD_DATABASE_URL && stripSecret(env.PROD_DATABASE_URL) === stripSecret(databaseUrl)) {
    reasons.push('DATABASE_URL matches PROD_DATABASE_URL');
  }

  const host = hostOf(databaseUrl);
  const dbName = databaseNameOf(databaseUrl);
  if (looksLikeProdToken(host) || looksLikeProdToken(dbName)) {
    reasons.push(`DATABASE_URL looks like production (host "${host || '?'}", database "${dbName || '?'}")`);
  }

  const apiHost = publicHost(env.PUBLIC_SERVER_URL);
  if (apiHost === PROD_API_HOST) {
    reasons.push(`PUBLIC_SERVER_URL is the production API (${PROD_API_HOST})`);
  }

  const confirmed = env.JOINUP_SEED_CONFIRM === 'dev';
  if (databaseUrl.trim() && !isRecognizedDevHost(host) && !confirmed) {
    reasons.push('DATABASE_URL host is not a recognized dev/local host; set JOINUP_SEED_CONFIRM=dev only for the Neon dev branch');
  }

  return reasons;
}

function assertSafeToSeed(env = process.env) {
  const reasons = seedRefusalReasons(env);
  if (!reasons.length) return;
  const error = new Error(`Refusing to seed the database:\n- ${reasons.join('\n- ')}`);
  error.code = 'SEED_REFUSED';
  throw error;
}

module.exports = {
  PROD_API_HOST,
  hostOf,
  databaseNameOf,
  isRecognizedDevHost,
  seedRefusalReasons,
  assertSafeToSeed,
};
