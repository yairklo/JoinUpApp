const assert = require('node:assert/strict');
const test = require('node:test');
const { assertShellDatabaseUrls, explicitProcessEnv, shellDatabaseProblems } = require('./dbEnv');

const LOCAL = 'postgresql://joinup:joinup@localhost:5432/joinup_e2e?schema=public';
const LOCAL_DIRECT = 'postgresql://joinup:joinup@127.0.0.1:5432/joinup_e2e?schema=public';

function env(overrides) {
  return { DATABASE_URL: LOCAL, DIRECT_DATABASE_URL: LOCAL, ...overrides };
}

test('localhost and 127.0.0.1 need no allowlist', () => {
  assert.deepEqual(shellDatabaseProblems(env({})), []);
  assert.doesNotThrow(() => assertShellDatabaseUrls(env({
    DATABASE_URL: LOCAL_DIRECT,
    DIRECT_DATABASE_URL: LOCAL_DIRECT,
  })));
});

test('a nameless Neon host is refused even when JOINUP_SEED_CONFIRM=dev', () => {
  const url = 'postgresql://u:p@ep-plain-123.eu-central-1.aws.neon.tech/neondb';
  const problems = shellDatabaseProblems(env({
    DATABASE_URL: url,
    DIRECT_DATABASE_URL: url,
    JOINUP_SEED_CONFIRM: 'dev',
  }));
  assert.match(problems.join(' '), /SEED_ALLOWED_DB_HOST/);
  assert.doesNotMatch(problems.join(' '), /JOINUP_SEED_CONFIRM=dev only/);
});

test('SEED_ALLOWED_DB_HOST covers the direct host and its pooler', () => {
  const problems = shellDatabaseProblems(env({
    DATABASE_URL: 'postgresql://u:p@ep-plain-123-pooler.eu-central-1.aws.neon.tech/neondb',
    DIRECT_DATABASE_URL: 'postgresql://u:p@ep-plain-123.eu-central-1.aws.neon.tech/neondb',
    SEED_ALLOWED_DB_HOST: 'ep-plain-123.eu-central-1.aws.neon.tech',
  }));
  assert.deepEqual(problems, []);
});

test('a dev-looking remote host still needs SEED_ALLOWED_DB_HOST', () => {
  const url = 'postgresql://u:p@ep-cool-dev-123.eu-central-1.aws.neon.tech/neondb';
  assert.match(shellDatabaseProblems(env({
    DATABASE_URL: url,
    DIRECT_DATABASE_URL: url,
    JOINUP_SEED_CONFIRM: 'dev',
  })).join(' '), /SEED_ALLOWED_DB_HOST/);
});

test('a pooler direct URL and mismatched databases are refused', () => {
  assert.match(shellDatabaseProblems(env({
    DATABASE_URL: 'postgresql://u:p@ep-plain-123-pooler.eu-central-1.aws.neon.tech/neondb',
    DIRECT_DATABASE_URL: 'postgresql://u:p@ep-plain-123-pooler.eu-central-1.aws.neon.tech/neondb',
    SEED_ALLOWED_DB_HOST: 'ep-plain-123.eu-central-1.aws.neon.tech',
  })).join(' '), /pooler/);
  assert.match(shellDatabaseProblems(env({
    DATABASE_URL: 'postgresql://u:p@ep-plain-123-pooler.eu-central-1.aws.neon.tech/neondb',
    DIRECT_DATABASE_URL: 'postgresql://u:p@ep-plain-123.eu-central-1.aws.neon.tech/otherdb',
    SEED_ALLOWED_DB_HOST: 'ep-plain-123.eu-central-1.aws.neon.tech',
  })).join(' '), /same database/);
});

test('a listed host does not allow a different host', () => {
  const problems = shellDatabaseProblems(env({
    DATABASE_URL: 'postgresql://u:p@ep-other.eu-central-1.aws.neon.tech/neondb',
    DIRECT_DATABASE_URL: 'postgresql://u:p@ep-plain-123.eu-central-1.aws.neon.tech/neondb',
    SEED_ALLOWED_DB_HOST: 'ep-plain-123.eu-central-1.aws.neon.tech',
  }));
  assert.match(problems.join(' '), /ep-other/);
});

test('missing shell URLs are refused', () => {
  assert.match(shellDatabaseProblems({ DIRECT_DATABASE_URL: LOCAL }).join(' '), /DATABASE_URL/);
  assert.match(shellDatabaseProblems({ DATABASE_URL: LOCAL }).join(' '), /DIRECT_DATABASE_URL/);
});

test('PROD_DATABASE_URL match is refused, including a different password on the same host', () => {
  assert.match(shellDatabaseProblems(env({ PROD_DATABASE_URL: LOCAL })).join(' '), /PROD_DATABASE_URL/);
  const prod = 'postgresql://other:secret@localhost:5432/joinup_e2e';
  assert.match(shellDatabaseProblems(env({ PROD_DATABASE_URL: prod })).join(' '), /PROD_DATABASE_URL/);
});

test('a prod-looking name is refused even if allowlisted', () => {
  const url = 'postgresql://u:p@ep-prod-1.neon.tech/neondb';
  assert.match(shellDatabaseProblems(env({
    DATABASE_URL: url,
    DIRECT_DATABASE_URL: url,
    SEED_ALLOWED_DB_HOST: 'ep-prod-1.neon.tech',
  })).join(' '), /production/);
});

test('localhost stays allowed when SEED_ALLOWED_DB_HOST is that host', () => {
  assert.deepEqual(shellDatabaseProblems(env({ SEED_ALLOWED_DB_HOST: 'localhost' })), []);
});

test('explicit API env skips dotenv and drops unrelated secrets', () => {
  const source = env({
    PATH: '/usr/bin',
    CLERK_SECRET_KEY: 'sk_test_example',
    MODERATION_PROVIDER: 'stub',
    OPENAI_API_KEY: 'should-not-forward',
    CLOUDINARY_URL: 'cloudinary://k:s@cloud',
    REDIS_URL: 'redis://prod.example',
    JOINUP_SEED_CONFIRM: 'dev',
  });
  const explicit = explicitProcessEnv(source, { PORT: '3005', NODE_ENV: 'development' });
  assert.equal(explicit.JOINUP_SKIP_DOTENV, '1');
  assert.equal(explicit.DATABASE_URL, LOCAL);
  assert.equal(explicit.PORT, '3005');
  assert.equal(explicit.NODE_ENV, 'development');
  assert.equal(explicit.PATH, '/usr/bin');
  assert.equal(explicit.CLERK_SECRET_KEY, 'sk_test_example');
  assert.equal(explicit.MODERATION_PROVIDER, 'stub');
  assert.equal(explicit.OPENAI_API_KEY, undefined);
  assert.equal(explicit.CLOUDINARY_URL, undefined);
  assert.equal(explicit.REDIS_URL, undefined);
  assert.equal(explicit.JOINUP_SEED_CONFIRM, 'dev');
});

test('a live provider still receives model keys', () => {
  const explicit = explicitProcessEnv(env({
    PATH: '/usr/bin',
    OPENAI_API_KEY: 'test-key',
  }), {});
  assert.equal(explicit.OPENAI_API_KEY, 'test-key');
  assert.equal(explicit.JOINUP_SKIP_DOTENV, '1');
});
