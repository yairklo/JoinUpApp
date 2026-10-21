/**
 * Playwright must see the database URLs in the shell environment that started
 * it. server/.env is not a source: the seed script and the API both load that
 * file, and on a laptop it may be production.
 *
 * Local hosts (localhost, 127.0.0.1, 0.0.0.0, *.local) need no allowlist.
 * Every remote host needs SEED_ALLOWED_DB_HOST set to the canonical host
 * (-pooler removed). Both URLs must be that same database, and
 * DIRECT_DATABASE_URL must not be a pooler host.
 * JOINUP_SEED_CONFIRM=dev does not choose the database.
 */

const PASSTHROUGH = [
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'TMPDIR',
  'TMP',
  'TEMP',
  'LANG',
  'LC_ALL',
  'TZ',
  'NODE_OPTIONS',
  'CI',
];

const FORWARDED = [
  'DATABASE_URL',
  'DIRECT_DATABASE_URL',
  'PROD_DATABASE_URL',
  'SEED_ALLOWED_DB_HOST',
  'CLERK_SECRET_KEY',
  'CLERK_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_CLERK_SIGN_IN_URL',
  'NEXT_PUBLIC_CLERK_SIGN_UP_URL',
  'NEXT_PUBLIC_CLERK_PROXY_URL',
  'NEXT_PUBLIC_API_URL',
  'PUBLIC_SERVER_URL',
  'MODERATION_PROVIDER',
  'ALLOW_DISK_UPLOADS',
  'E2E_SERVER_NODE_ENV',
  // The seed script still reads this for hosts with no dev/test token.
  // It does not bypass SEED_ALLOWED_DB_HOST. See docs/dev-seed.md.
  'JOINUP_SEED_CONFIRM',
];

function stripSecret(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function hostOf(databaseUrl) {
  const raw = String(databaseUrl || '').trim();
  if (!raw) return '';
  try {
    const normalized = raw.replace(/^postgres(?:ql)?:\/\//i, 'http://');
    const parsed = new URL(normalized);
    if (parsed.hostname) {
      return `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}`.toLowerCase();
    }
  } catch {
    // fall through to a textual parse
  }
  const match = raw.match(/@([^/?]+)/);
  if (!match) return '';
  return match[1].split(',')[0].trim().toLowerCase();
}

function databaseNameOf(databaseUrl) {
  const raw = String(databaseUrl || '').trim();
  if (!raw) return '';
  try {
    const normalized = raw.replace(/^postgres(?:ql)?:\/\//i, 'http://');
    const parsed = new URL(normalized);
    const name = decodeURIComponent(parsed.pathname.replace(/^\//, '').split('/')[0] || '');
    return name.toLowerCase();
  } catch {
    const match = raw.match(/@[^/]+\/([^?]+)/);
    return match ? decodeURIComponent(match[1]).toLowerCase() : '';
  }
}

function bareHost(host) {
  return String(host || '').trim().toLowerCase().replace(/:\d+$/, '');
}

/**
 * Neon lists the pooler as "<endpoint>-pooler.<region>…". Same database.
 * Accepts a full URL or a bare host. Port and `-pooler` are removed.
 */
function canonicalHost(databaseUrlOrHost) {
  const raw = String(databaseUrlOrHost || '').trim().toLowerCase();
  if (!raw) return '';
  const host = raw.includes('://') || raw.includes('@') ? hostOf(raw) : raw;
  return bareHost(host).replace(/-pooler(?=\.|$)/gi, '');
}

function isPoolerHost(databaseUrl) {
  return /-pooler(?=\.|$)/i.test(bareHost(hostOf(databaseUrl)));
}

function isLocalHost(host) {
  const bare = canonicalHost(host);
  return bare === 'localhost' || bare === '127.0.0.1' || bare === '0.0.0.0' || bare.endsWith('.local');
}

function looksLikeProdToken(value) {
  return /(^|[.\-_])prod(uction)?([.\-_]|$)/i.test(String(value || ''));
}

function allowlistHost(env) {
  return canonicalHost(env.SEED_ALLOWED_DB_HOST || '');
}

function hostMatchesAllowlist(host, allowed) {
  if (!allowed) return false;
  return canonicalHost(host) === allowed;
}

function sameDatabase(a, b) {
  if (!a || !b) return false;
  if (stripSecret(a) === stripSecret(b)) return true;
  const hostA = canonicalHost(hostOf(a));
  const hostB = canonicalHost(hostOf(b));
  const nameA = databaseNameOf(a);
  const nameB = databaseNameOf(b);
  return Boolean(hostA && hostA === hostB && nameA && nameA === nameB);
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]} empty when the shell URLs are safe to use
 */
function shellDatabaseProblems(env = process.env) {
  const problems = [];
  const databaseUrl = String(env.DATABASE_URL || '').trim();
  const directUrl = String(env.DIRECT_DATABASE_URL || '').trim();

  if (!databaseUrl) {
    problems.push('DATABASE_URL is not set in the shell environment (refusing to load it from server/.env)');
  }
  if (!directUrl) {
    problems.push('DIRECT_DATABASE_URL is not set in the shell environment (Prisma directUrl; refusing to load it from server/.env)');
  }

  const prodHost = canonicalHost(env.PROD_DATABASE_URL || '');
  if (prodHost && databaseUrl && canonicalHost(hostOf(databaseUrl)) === prodHost) {
    problems.push(`DATABASE_URL host matches PROD_DATABASE_URL (${prodHost})`);
  }
  if (prodHost && directUrl && canonicalHost(hostOf(directUrl)) === prodHost) {
    problems.push(`DIRECT_DATABASE_URL host matches PROD_DATABASE_URL (${prodHost})`);
  }

  if (databaseUrl && directUrl && !sameDatabase(databaseUrl, directUrl)) {
    problems.push('DATABASE_URL and DIRECT_DATABASE_URL must be the same database once -pooler is removed');
  }
  if (directUrl && isPoolerHost(directUrl)) {
    problems.push('DIRECT_DATABASE_URL points at a pooler host; use the direct endpoint');
  }

  const allowed = allowlistHost(env);
  for (const [label, url] of [['DATABASE_URL', databaseUrl], ['DIRECT_DATABASE_URL', directUrl]]) {
    if (!url) continue;
    const host = hostOf(url);
    const name = databaseNameOf(url);
    if (!host) {
      problems.push(`${label} has no parseable host`);
      continue;
    }
    if (looksLikeProdToken(host) || looksLikeProdToken(name) || looksLikeProdToken(canonicalHost(host))) {
      problems.push(`${label} looks like production (host "${bareHost(host)}", database "${name || '?'}")`);
      continue;
    }
    if (isLocalHost(host)) {
      if (allowed && !hostMatchesAllowlist(host, allowed)) {
        problems.push(`${label}: host "${bareHost(host)}" does not match SEED_ALLOWED_DB_HOST`);
      }
      continue;
    }
    if (!allowed) {
      problems.push(`${label}: remote host "${canonicalHost(host)}" requires SEED_ALLOWED_DB_HOST (the canonical host, -pooler removed)`);
    } else if (!hostMatchesAllowlist(host, allowed)) {
      problems.push(`${label}: host "${canonicalHost(host)}" does not match SEED_ALLOWED_DB_HOST (${allowed})`);
    }
  }

  return problems;
}

function assertShellDatabaseUrls(env = process.env) {
  const problems = shellDatabaseProblems(env);
  if (!problems.length) return;
  const error = new Error(`Refusing to run Playwright against this database:\n- ${problems.join('\n- ')}`);
  error.code = 'E2E_DATABASE_REFUSED';
  throw error;
}

/**
 * Environment for the API process Playwright starts.
 * Does not inherit the parent environment: server/.env must not fill gaps,
 * and a laptop REDIS_URL / CLOUDINARY_URL must not ride along.
 * Model keys are forwarded only for a live provider. The stub must not call them.
 *
 * @param {NodeJS.ProcessEnv} source
 * @param {NodeJS.ProcessEnv} [overrides]
 */
function explicitProcessEnv(source, overrides = {}) {
  assertShellDatabaseUrls(source);
  /** @type {NodeJS.ProcessEnv} */
  const env = {};
  for (const key of PASSTHROUGH) {
    if (source[key]) env[key] = source[key];
  }
  for (const key of FORWARDED) {
    if (source[key]) env[key] = source[key];
  }
  if (source.MODERATION_PROVIDER !== 'stub') {
    if (source.OPENAI_API_KEY) env.OPENAI_API_KEY = source.OPENAI_API_KEY;
    if (source.GOOGLE_API_KEY) env.GOOGLE_API_KEY = source.GOOGLE_API_KEY;
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined && value !== null) env[key] = String(value);
  }
  env.JOINUP_SKIP_DOTENV = '1';
  return env;
}

module.exports = {
  hostOf,
  canonicalHost,
  databaseNameOf,
  shellDatabaseProblems,
  assertShellDatabaseUrls,
  explicitProcessEnv,
};
