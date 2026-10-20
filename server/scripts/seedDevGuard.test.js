const { assertSafeToSeed, seedRefusalReasons } = require('./seedDevGuard');

const TEST_KEY = 'sk_test_seed_guard_not_a_real_secret';

function env(overrides) {
  return {
    DATABASE_URL: 'postgresql://joinup:joinup@localhost:5432/joinup_dev',
    CLERK_SECRET_KEY: TEST_KEY,
    PUBLIC_SERVER_URL: 'https://joinup-dev-api.duckdns.org',
    ...overrides,
  };
}

describe('seedDev guard', () => {
  test('allows localhost with a test key', () => {
    expect(seedRefusalReasons(env({}))).toEqual([]);
    expect(() => assertSafeToSeed(env({}))).not.toThrow();
  });

  test('allows a Neon host that says dev', () => {
    expect(seedRefusalReasons(env({
      DATABASE_URL: 'postgresql://u:p@ep-cool-dev-123.eu-central-1.aws.neon.tech/neondb',
    }))).toEqual([]);
  });

  test('refuses a nameless Neon host unless JOINUP_SEED_CONFIRM=dev', () => {
    const url = 'postgresql://u:p@ep-plain-123.eu-central-1.aws.neon.tech/neondb';
    expect(seedRefusalReasons(env({ DATABASE_URL: url })).join(' ')).toMatch(/JOINUP_SEED_CONFIRM/);
    expect(seedRefusalReasons(env({ DATABASE_URL: url, JOINUP_SEED_CONFIRM: 'dev' }))).toEqual([]);
  });

  test('refuses Clerk live keys even with confirm and a dev host', () => {
    const reasons = seedRefusalReasons(env({
      CLERK_SECRET_KEY: 'sk_live_nope',
      JOINUP_SEED_CONFIRM: 'dev',
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
    expect(seedRefusalReasons(env({
      DATABASE_URL: 'postgresql://u:p@ep-prod-1.neon.tech/neondb',
      JOINUP_SEED_CONFIRM: 'dev',
    })).join(' ')).toMatch(/looks like production/);
    expect(seedRefusalReasons(env({
      DATABASE_URL: 'postgresql://u:p@localhost:5432/production',
      JOINUP_SEED_CONFIRM: 'dev',
    })).join(' ')).toMatch(/looks like production/);
  });

  test('refuses when DATABASE_URL equals PROD_DATABASE_URL', () => {
    const url = 'postgresql://u:p@127.0.0.1:5432/joinup_dev';
    expect(seedRefusalReasons(env({
      DATABASE_URL: url,
      PROD_DATABASE_URL: url,
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
});
