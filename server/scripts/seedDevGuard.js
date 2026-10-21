/**
 * Refuses to seed when the environment could be production.
 *
 * Hard stops (no override): live Clerk keys, a prod-looking database host or
 * name, either URL sharing a host with PROD_DATABASE_URL, DATABASE_URL and
 * DIRECT_DATABASE_URL pointing at different databases, a pooler host on the
 * direct URL, or PUBLIC_SERVER_URL pointing at the production API.
 *
 * prisma migrate deploy uses DIRECT_DATABASE_URL (schema directUrl). Every
 * check applies to both URLs. Hosts are compared after `-pooler` is removed,
 * so the pooled URL and the direct URL of one Neon endpoint are the same
 * database, and so is a pooled vs direct PROD_DATABASE_URL.
 *
 * A remote host is not identified by JOINUP_SEED_CONFIRM=dev. The confirm flag
 * only covers Neon endpoints whose name has no dev/preview/staging/test/branch/ci
 * token. Those tokens match a whole dot/hyphen/underscore segment (`ep-cool-dev-1`
 * passes; `precious`, `ancient`, and `contest` do not). Remote seeds also need
 * SEED_ALLOWED_DB_HOST equal to that canonical host, and a marker row on the
 * database itself (assertDevDatabaseMarker).
 */

const PROD_API_HOST = 'joinup-api.duckdns.org';
const MARKER_TABLE = 'joinup_dev_seed_marker';
const DEV_HOST_TOKENS = new Set(['dev', 'preview', 'staging', 'test', 'branch', 'ci']);

function hostOf(databaseUrl) {
  const match = String(databaseUrl || '').match(/@([^/?]+)/);
  if (!match) return '';
  // Neon can list host:port. Drop userinfo that slipped through.
  return match[1].split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
}

function databaseNameOf(databaseUrl) {
  const match = String(databaseUrl || '').match(/@[^/]+\/([^?]+)/);
  if (!match) return '';
  return decodeURIComponent(match[1]).toLowerCase();
}

/**
 * Neon pooled and direct hosts differ only by a `-pooler` label
 * (`ep-name-pooler.region.aws.neon.tech` vs `ep-name.region.aws.neon.tech`).
 * Accepts a full URL or a bare host. Port and `-pooler` are removed.
 */
function canonicalDatabaseHost(databaseUrlOrHost) {
  const raw = String(databaseUrlOrHost || '').trim().toLowerCase();
  if (!raw) return '';
  const host = raw.includes('://') || raw.includes('@') ? hostOf(raw) : raw.replace(/:\d+$/, '');
  return host.replace(/-pooler(?=\.|$)/g, '');
}

function isPoolerHost(databaseUrl) {
  return /-pooler(?=\.|$)/i.test(hostOf(databaseUrl));
}

function isLocalHost(host) {
  const bare = canonicalDatabaseHost(host);
  return bare === 'localhost' || bare === '127.0.0.1' || bare === '0.0.0.0' || bare.endsWith('.local');
}

function looksLikeProdToken(value) {
  return /(^|[.\-_])prod(uction)?([.\-_]|$)/i.test(String(value || ''));
}

function isRecognizedDevHost(host) {
  const bare = canonicalDatabaseHost(host);
  if (!bare) return false;
  if (isLocalHost(bare)) return true;
  const tokens = bare.split(/[.\-_]+/).filter(Boolean);
  return tokens.some((token) => DEV_HOST_TOKENS.has(token));
}

function sameDatabaseEndpoint(leftUrl, rightUrl) {
  const leftHost = canonicalDatabaseHost(leftUrl);
  const rightHost = canonicalDatabaseHost(rightUrl);
  const leftName = databaseNameOf(leftUrl);
  const rightName = databaseNameOf(rightUrl);
  return Boolean(leftHost && leftName && leftHost === rightHost && leftName === rightName);
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

function markerInstructions(host) {
  const label = /^[a-z0-9.-]+$/.test(host) ? host : '(canonical dev host)';
  return [
    `remote database has no ${MARKER_TABLE} row for this host (${label}).`,
    'Create that row on the dev database only (do not run this against production):',
    `CREATE TABLE IF NOT EXISTS ${MARKER_TABLE} (id text PRIMARY KEY, host text NOT NULL);`,
    `INSERT INTO ${MARKER_TABLE} (id, host) VALUES ('dev', '${label}')`,
    'ON CONFLICT (id) DO UPDATE SET host = EXCLUDED.host;',
  ].join(' ');
}

function isMissingMarkerTable(error) {
  if (!error) return false;
  if (error.code === '42P01') return true;
  const message = String(error.message || '');
  return /joinup_dev_seed_marker/i.test(message) && /does not exist/i.test(message);
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {string[]} human-readable reasons. Empty means the URL/key guard passes.
 */
function seedRefusalReasons(env) {
  const reasons = [];
  const databaseUrl = String(env.DATABASE_URL || '').trim();
  const directUrl = String(env.DIRECT_DATABASE_URL || '').trim();
  if (!databaseUrl) reasons.push('DATABASE_URL is missing');
  if (!directUrl) {
    reasons.push('DIRECT_DATABASE_URL is missing (prisma migrate deploy uses it, not DATABASE_URL)');
  }

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

  const urls = [
    ['DATABASE_URL', databaseUrl],
    ['DIRECT_DATABASE_URL', directUrl],
  ].filter(([, url]) => url);

  if (databaseUrl && directUrl && !sameDatabaseEndpoint(databaseUrl, directUrl)) {
    reasons.push('DATABASE_URL and DIRECT_DATABASE_URL must point at the same database once -pooler is removed from the host');
  }
  if (directUrl && isPoolerHost(directUrl)) {
    reasons.push('DIRECT_DATABASE_URL points at a Neon pooler host; use the direct endpoint (no -pooler)');
  }

  for (const [label, url] of urls) {
    const host = hostOf(url);
    const dbName = databaseNameOf(url);
    if (looksLikeProdToken(host) || looksLikeProdToken(dbName) || looksLikeProdToken(canonicalDatabaseHost(url))) {
      reasons.push(`${label} looks like production (host "${host || '?'}", database "${dbName || '?'}")`);
    }
  }

  const prodUrl = String(env.PROD_DATABASE_URL || '').trim();
  const prodHost = prodUrl ? canonicalDatabaseHost(prodUrl) : '';
  if (prodHost) {
    for (const [label, url] of urls) {
      if (canonicalDatabaseHost(url) === prodHost) {
        reasons.push(`${label} host matches PROD_DATABASE_URL (${prodHost}); pooled and direct hosts are the same endpoint`);
      }
    }
  }

  const apiHost = publicHost(env.PUBLIC_SERVER_URL);
  if (apiHost === PROD_API_HOST) {
    reasons.push(`PUBLIC_SERVER_URL is the production API (${PROD_API_HOST})`);
  }

  const primaryHost = canonicalDatabaseHost(databaseUrl);
  const allowed = canonicalDatabaseHost(env.SEED_ALLOWED_DB_HOST || '');
  if (databaseUrl && !isLocalHost(primaryHost)) {
    if (!allowed) {
      reasons.push('SEED_ALLOWED_DB_HOST is missing; set it to the dev endpoint host with -pooler removed');
    } else if (urls.some(([, url]) => canonicalDatabaseHost(url) !== allowed)) {
      reasons.push(`SEED_ALLOWED_DB_HOST (${allowed}) does not match both database hosts`);
    }
    if (!isRecognizedDevHost(primaryHost) && env.JOINUP_SEED_CONFIRM !== 'dev') {
      reasons.push('database host is not a recognized dev/local host; set JOINUP_SEED_CONFIRM=dev only for the Neon dev branch (this flag does not identify the database by itself)');
    }
  } else if (allowed && urls.some(([, url]) => canonicalDatabaseHost(url) !== allowed)) {
    reasons.push(`SEED_ALLOWED_DB_HOST (${allowed}) does not match both database hosts`);
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

/**
 * Positive identification for a remote dev database. Local hosts skip this.
 * The seed never creates the marker: production must not be able to bless itself.
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {(sql: string, params: unknown[]) => Promise<Array<{ host?: string }>>} query
 */
async function assertDevDatabaseMarker(env, query) {
  const host = canonicalDatabaseHost(env.DATABASE_URL || '');
  if (!host || isLocalHost(host)) return;

  let rows;
  try {
    rows = await query(`SELECT host FROM public.${MARKER_TABLE} WHERE id = $1`, ['dev']);
  } catch (error) {
    if (!isMissingMarkerTable(error)) throw error;
    rows = [];
  }
  const recorded = rows && rows[0] && rows[0].host;
  if (!recorded || canonicalDatabaseHost(recorded) !== host) {
    const error = new Error(`Refusing to seed the database:\n- ${markerInstructions(host)}`);
    error.code = 'SEED_REFUSED';
    throw error;
  }
}

module.exports = {
  PROD_API_HOST,
  MARKER_TABLE,
  DEV_HOST_TOKENS,
  hostOf,
  databaseNameOf,
  canonicalDatabaseHost,
  isPoolerHost,
  isLocalHost,
  isRecognizedDevHost,
  sameDatabaseEndpoint,
  seedRefusalReasons,
  assertSafeToSeed,
  assertDevDatabaseMarker,
  markerInstructions,
};
