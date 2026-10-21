const {
  assertSafeToSeed,
  assertDevDatabaseMarker,
  canonicalDatabaseHost,
  isRecognizedDevHost,
  seedRefusalReasons,
} = require('./seedDevGuard');

const TEST_KEY = 'sk_test_seed_guard_not_a_real_secret';
const DEV_HOST = 'ep-cool-dev-123.eu-central-1.aws.neon.tech';
const DEV_POOLED = `postgresql://u:p@ep-cool-dev-123-pooler.eu-central-1.aws.neon.tech/neondb`;
const DEV_DIRECT = `postgresql://u:p@${DEV_HOST}/neondb`;

function env(overrides = {}) {
  const databaseUrl = Object.prototype.hasOwnProperty.call(overrides, 'DATABASE_URL')
    ? overrides.DATABASE_URL
    : 'postgresql://joinup:joinup@localhost:5432/joinup_dev';
  const directUrl = Object.prototype.hasOwnProperty.call(overrides, 'DIRECT_DATABASE_URL')
    ? overrides.DIRECT_DATABASE_URL
    : databaseUrl;
  return {
    CLERK_SECRET_KEY: TEST_KEY,
    PUBLIC_SERVER_URL: 'https://joinup-dev-api.duckdns.org',
    ...overrides,
    DATABASE_URL: databaseUrl,
    DIRECT_DATABASE_URL: directUrl,
  };
}

describe('seedDev guard', () => {
  test('allows localhost with a test key when both URLs match', () => {
    expect(seedRefusalReasons(env({}))).toEqual([]);
    expect(() => assertSafeToSeed(env({}))).not.toThrow();
  });

  test('treats a pooled URL and a direct URL as the same endpoint', () => {
    expect(canonicalDatabaseHost(DEV_POOLED)).toBe(DEV_HOST);
    expect(canonicalDatabaseHost(DEV_DIRECT)).toBe(DEV_HOST);
    expect(seedRefusalReasons(env({
      DATABASE_URL: DEV_POOLED,
      DIRECT_DATABASE_URL: DEV_DIRECT,
      SEED_ALLOWED_DB_HOST: DEV_HOST,
    }))).toEqual([]);
  });

  test('refuses when DIRECT_DATABASE_URL is missing or is a different database', () => {
    expect(seedRefusalReasons(env({ DIRECT_DATABASE_URL: '' })).join(' ')).toMatch(/DIRECT_DATABASE_URL is missing/);
    expect(seedRefusalReasons(env({
      DATABASE_URL: 'postgresql://joinup:joinup@localhost:5432/joinup_dev',
      DIRECT_DATABASE_URL: 'postgresql://joinup:joinup@localhost:5432/other',
    })).join(' ')).toMatch(/same database/);
    expect(seedRefusalReasons(env({
      DATABASE_URL: DEV_POOLED,
      DIRECT_DATABASE_URL: 'postgresql://u:p@ep-other-dev.eu-central-1.aws.neon.tech/neondb',
      SEED_ALLOWED_DB_HOST: DEV_HOST,
    })).join(' ')).toMatch(/same database/);
  });

  test('refuses a pooler host on DIRECT_DATABASE_URL', () => {
    expect(seedRefusalReasons(env({
      DATABASE_URL: DEV_POOLED,
      DIRECT_DATABASE_URL: DEV_POOLED,
      SEED_ALLOWED_DB_HOST: DEV_HOST,
    })).join(' ')).toMatch(/pooler/);
  });

  test('refuses a remote host unless SEED_ALLOWED_DB_HOST matches both URLs', () => {
    expect(seedRefusalReasons(env({
      DATABASE_URL: DEV_POOLED,
      DIRECT_DATABASE_URL: DEV_DIRECT,
    })).join(' ')).toMatch(/SEED_ALLOWED_DB_HOST/);
    expect(seedRefusalReasons(env({
      DATABASE_URL: DEV_POOLED,
      DIRECT_DATABASE_URL: DEV_DIRECT,
      SEED_ALLOWED_DB_HOST: 'ep-someone-else.neon.tech',
    })).join(' ')).toMatch(/does not match/);
  });

  test('refuses a nameless Neon host unless JOINUP_SEED_CONFIRM=dev and the allowlist matches', () => {
    const url = 'postgresql://u:p@ep-plain-123.eu-central-1.aws.neon.tech/neondb';
    const host = 'ep-plain-123.eu-central-1.aws.neon.tech';
    expect(seedRefusalReasons(env({ DATABASE_URL: url, DIRECT_DATABASE_URL: url })).join(' ')).toMatch(/JOINUP_SEED_CONFIRM/);
    expect(seedRefusalReasons(env({
      DATABASE_URL: url,
      DIRECT_DATABASE_URL: url,
      JOINUP_SEED_CONFIRM: 'dev',
    })).join(' ')).toMatch(/SEED_ALLOWED_DB_HOST/);
    expect(seedRefusalReasons(env({
      DATABASE_URL: url,
      DIRECT_DATABASE_URL: url,
      SEED_ALLOWED_DB_HOST: host,
    })).join(' ')).toMatch(/JOINUP_SEED_CONFIRM/);
    expect(seedRefusalReasons(env({
      DATABASE_URL: url,
      DIRECT_DATABASE_URL: url,
      SEED_ALLOWED_DB_HOST: host,
      JOINUP_SEED_CONFIRM: 'dev',
    }))).toEqual([]);
  });

  test('does not treat ci or test substrings as a dev host token', () => {
    const hosts = [
      'ep-precious-123.eu-central-1.aws.neon.tech',
      'ep-ancient-123.eu-central-1.aws.neon.tech',
      'ep-contest-123.eu-central-1.aws.neon.tech',
    ];
    for (const host of hosts) {
      expect(isRecognizedDevHost(host)).toBe(false);
      const url = `postgresql://u:p@${host}/neondb`;
      const reasons = seedRefusalReasons(env({
        DATABASE_URL: url,
        DIRECT_DATABASE_URL: url,
        SEED_ALLOWED_DB_HOST: host,
      }));
      expect(reasons.join(' ')).toMatch(/JOINUP_SEED_CONFIRM/);
    }
    expect(isRecognizedDevHost('ep-ci-123.eu-central-1.aws.neon.tech')).toBe(true);
    expect(isRecognizedDevHost('ep-my-test-db.neon.tech')).toBe(true);
    expect(seedRefusalReasons(env({
      DATABASE_URL: 'postgresql://u:p@ep-ci-123.eu-central-1.aws.neon.tech/neondb',
      DIRECT_DATABASE_URL: 'postgresql://u:p@ep-ci-123.eu-central-1.aws.neon.tech/neondb',
      SEED_ALLOWED_DB_HOST: 'ep-ci-123.eu-central-1.aws.neon.tech',
    }))).toEqual([]);
  });

  test('refuses Clerk live keys even with confirm, a dev host, and an allowlist', () => {
    const reasons = seedRefusalReasons(env({
      CLERK_SECRET_KEY: 'sk_live_nope',
      JOINUP_SEED_CONFIRM: 'dev',
      DATABASE_URL: DEV_POOLED,
      DIRECT_DATABASE_URL: DEV_DIRECT,
      SEED_ALLOWED_DB_HOST: DEV_HOST,
    }));
    expect(reasons.join(' ')).toMatch(/live key/);
    expect(() => assertSafeToSeed(env({ CLERK_SECRET_KEY: 'sk_live_nope' }))).toThrow(/Refusing to seed/);
  });

  test('refuses a publishable live key', () => {
    expect(seedRefusalReasons(env({
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_nope',
    })).join(' ')).toMatch(/live key/);
  });

  test('refuses a host or database name that looks like production, even if confirmed', () => {
    const prodDirect = 'postgresql://u:p@ep-prod-1.neon.tech/neondb';
    expect(seedRefusalReasons(env({
      DATABASE_URL: 'postgresql://u:p@ep-prod-1-pooler.neon.tech/neondb',
      DIRECT_DATABASE_URL: prodDirect,
      SEED_ALLOWED_DB_HOST: 'ep-prod-1.neon.tech',
      JOINUP_SEED_CONFIRM: 'dev',
    })).join(' ')).toMatch(/looks like production/);
    expect(seedRefusalReasons(env({
      DATABASE_URL: 'postgresql://u:p@localhost:5432/production',
      JOINUP_SEED_CONFIRM: 'dev',
    })).join(' ')).toMatch(/looks like production/);
  });

  test('refuses when either URL matches PROD_DATABASE_URL by host, including the pooler variant', () => {
    const url = 'postgresql://u:p@127.0.0.1:5432/joinup_dev';
    expect(seedRefusalReasons(env({
      DATABASE_URL: url,
      PROD_DATABASE_URL: 'postgresql://other:secret@127.0.0.1:5432/joinup_prod',
    })).join(' ')).toMatch(/PROD_DATABASE_URL/);

    const prodPooled = 'postgresql://prod:secret@ep-plain-123-pooler.eu-central-1.aws.neon.tech/neondb';
    const direct = 'postgresql://dev:other@ep-plain-123.eu-central-1.aws.neon.tech/neondb';
    const pooled = 'postgresql://dev:other@ep-plain-123-pooler.eu-central-1.aws.neon.tech/neondb';
    expect(seedRefusalReasons(env({
      DATABASE_URL: pooled,
      DIRECT_DATABASE_URL: direct,
      PROD_DATABASE_URL: prodPooled,
      SEED_ALLOWED_DB_HOST: 'ep-plain-123.eu-central-1.aws.neon.tech',
      JOINUP_SEED_CONFIRM: 'dev',
    })).join(' ')).toMatch(/PROD_DATABASE_URL/);
  });

  test('refuses the production API hostname', () => {
    expect(seedRefusalReasons(env({
      PUBLIC_SERVER_URL: 'https://joinup-api.duckdns.org',
    })).join(' ')).toMatch(/production API/);
  });

  test('refuses a missing or non-test Clerk secret', () => {
    expect(seedRefusalReasons(env({ CLERK_SECRET_KEY: '' })).join(' ')).toMatch(/missing/);
    expect(seedRefusalReasons(env({ CLERK_SECRET_KEY: 'secret_other' })).join(' ')).toMatch(/sk_test_/);
  });

  test('requires a dev marker row on remote databases and skips it locally', async () => {
    const query = jest.fn();
    await expect(assertDevDatabaseMarker(env({}), query)).resolves.toBeUndefined();
    expect(query).not.toHaveBeenCalled();

    const remote = env({
      DATABASE_URL: DEV_POOLED,
      DIRECT_DATABASE_URL: DEV_DIRECT,
      SEED_ALLOWED_DB_HOST: DEV_HOST,
    });
    const missing = Object.assign(new Error('relation "joinup_dev_seed_marker" does not exist'), { code: '42P01' });
    await expect(assertDevDatabaseMarker(remote, async () => { throw missing; })).rejects.toThrow(/joinup_dev_seed_marker/);
    await expect(assertDevDatabaseMarker(remote, async () => [])).rejects.toThrow(/joinup_dev_seed_marker/);
    await expect(assertDevDatabaseMarker(remote, async () => [{ host: 'ep-other.neon.tech' }])).rejects.toThrow(/joinup_dev_seed_marker/);
    await expect(assertDevDatabaseMarker(remote, async () => [{ host: `${DEV_HOST.split('.')[0]}-pooler.${DEV_HOST.split('.').slice(1).join('.')}` }])).resolves.toBeUndefined();
    await expect(assertDevDatabaseMarker(remote, async () => [{ host: DEV_HOST }])).resolves.toBeUndefined();
  });
});
