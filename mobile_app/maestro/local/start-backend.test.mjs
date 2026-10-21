import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  BLOCKED_PROD_ENV_KEYS,
  LOCAL_DB_URL,
  assertClerkDevKeys,
  buildE2EBackendEnv,
} from './start-backend.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..', '..');

const PROD_PARENT = {
  PATH: process.env.PATH,
  REDIS_URL: 'redis://prod.example:6379',
  SENTRY_DSN: 'https://example.ingest.sentry.io/1',
  SENTRY_AUTH_TOKEN: 'sentry-token',
  SENTRY_ENVIRONMENT: 'production',
  CLOUDINARY_URL: 'cloudinary://key:secret@cloud',
  CLOUDINARY_ACCOUNT_URL: 'account://key:secret@account',
  CLOUDINARY_API_PROXY: 'https://proxy.example',
  FIREBASE_SERVICE_ACCOUNT_PATH: '/tmp/prod-sa.json',
  FIREBASE_PROJECT_ID: 'prod-project',
  FIREBASE_PRIVATE_KEY: 'not-a-real-private-key',
  FIREBASE_CLIENT_EMAIL: 'firebase@prod.iam.gserviceaccount.com',
  FIREBASE_CONFIG: '{"projectId":"prod-project"}',
  GOOGLE_APPLICATION_CREDENTIALS: '/tmp/prod-adc.json',
  OPENAI_API_KEY: 'sk-prod-openai',
  GOOGLE_API_KEY: 'AIza-prod',
  EXPO_ACCESS_TOKEN: 'expo-prod-token',
  PUBLIC_SERVER_URL: 'https://joinup-api.duckdns.org',
  JWT_SECRET: 'prod-jwt',
  DOTENV_KEY: 'dotenv://:key@dotenvx.com/vault/.env.vault?environment=prod',
  DATABASE_URL: 'postgresql://prod:prod@prod.example:5432/prod',
  DIRECT_DATABASE_URL: 'postgresql://prod:prod@prod.example:5432/prod',
  CLERK_SECRET_KEY: 'sk_live_from_shell',
  CLERK_PUBLISHABLE_KEY: 'pk_live_from_shell',
  NODE_ENV: 'production',
  PORT: '3001',
};

test('blanks prod service env and pins the local database and Clerk dev keys', () => {
  const env = buildE2EBackendEnv(PROD_PARENT, { pub: 'pk_test_abc', secret: 'sk_test_abc' });
  for (const key of BLOCKED_PROD_ENV_KEYS) {
    assert.equal(env[key], '', key);
  }
  assert.equal(env.DATABASE_URL, LOCAL_DB_URL);
  assert.equal(env.DIRECT_DATABASE_URL, LOCAL_DB_URL);
  assert.equal(env.CLERK_SECRET_KEY, 'sk_test_abc');
  assert.equal(env.CLERK_PUBLISHABLE_KEY, 'pk_test_abc');
  assert.equal(env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY, 'pk_test_abc');
  assert.equal(env.NODE_ENV, 'development');
  assert.equal(env.ALLOW_DISK_UPLOADS, 'true');
  assert.equal(env.PORT, '3005');
  assert.equal(env.PATH, process.env.PATH);
});

test('refuses non-development Clerk keys without echoing them', () => {
  const secret = 'sk_live_DO_NOT_PRINT';
  const pub = 'pk_live_DO_NOT_PRINT';
  assert.throws(
    () => assertClerkDevKeys(pub, secret),
    (err) => {
      assert.match(err.message, /sk_test_/);
      assert.equal(err.message.includes(secret), false);
      assert.equal(err.message.includes(pub), false);
      assert.equal(err.message.includes('live'), false);
      return true;
    },
  );
  assert.throws(
    () => buildE2EBackendEnv(PROD_PARENT, { pub: 'pk_test_ok', secret }),
    (err) => {
      assert.equal(err.message.includes(secret), false);
      return true;
    },
  );
});

test('CLI refuses a live Clerk key without printing it or starting Docker', () => {
  const secret = 'sk_live_DO_NOT_PRINT';
  const pub = 'pk_live_DO_NOT_PRINT';
  const r = spawnSync(process.execPath, [join(here, 'start-backend.mjs')], {
    env: { ...process.env, CLERK_SECRET_KEY: secret, CLERK_PUBLISHABLE_KEY: pub },
    encoding: 'utf8',
  });
  assert.notEqual(r.status, 0);
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  assert.equal(out.includes(secret), false);
  assert.equal(out.includes(pub), false);
  assert.match(out, /pk_test_|sk_test_/);
  assert.equal(out.toLowerCase().includes('docker'), false);
});

test('dotenv cannot refill blanked keys or replace the local database URL', () => {
  const dotenvEntry = join(repo, 'server/node_modules/dotenv/lib/main.js');
  assert.equal(existsSync(dotenvEntry), true, 'install server dependencies before this check');
  const dir = mkdtempSync(join(tmpdir(), 'e2e-dotenv-'));
  writeFileSync(join(dir, '.env'), [
    'REDIS_URL=redis://prod.example:6379',
    'SENTRY_DSN=https://example.ingest.sentry.io/1',
    'CLOUDINARY_URL=cloudinary://key:secret@cloud',
    'CLOUDINARY_ACCOUNT_URL=account://key:secret@account',
    'FIREBASE_SERVICE_ACCOUNT_PATH=/tmp/prod-sa.json',
    'FIREBASE_PROJECT_ID=prod-project',
    'FIREBASE_PRIVATE_KEY=not-a-real-private-key',
    'FIREBASE_CLIENT_EMAIL=firebase@prod.iam.gserviceaccount.com',
    'FIREBASE_CONFIG={"projectId":"prod-project"}',
    'GOOGLE_APPLICATION_CREDENTIALS=/tmp/prod-adc.json',
    'OPENAI_API_KEY=sk-prod-openai',
    'GOOGLE_API_KEY=AIza-prod',
    'EXPO_ACCESS_TOKEN=expo-prod-token',
    'PUBLIC_SERVER_URL=https://joinup-api.duckdns.org',
    'JWT_SECRET=prod-jwt',
    'DOTENV_KEY=dotenv://:key@dotenvx.com/vault/.env.vault?environment=prod',
    'DATABASE_URL=postgresql://prod:prod@prod.example:5432/prod',
    'DIRECT_DATABASE_URL=postgresql://prod:prod@prod.example:5432/prod',
    'CLERK_SECRET_KEY=sk_live_fromdotenv',
    'CLERK_PUBLISHABLE_KEY=pk_live_fromdotenv',
    'NODE_ENV=production',
  ].join('\n'));

  const env = buildE2EBackendEnv({ PATH: process.env.PATH }, {
    pub: 'pk_test_parent',
    secret: 'sk_test_parent',
  });
  const script = `
    const dotenv = require(${JSON.stringify(dotenvEntry)});
    dotenv.config();
    const keys = ${JSON.stringify(BLOCKED_PROD_ENV_KEYS)};
    const bad = [];
    for (const key of keys) {
      if (process.env[key]) bad.push(key);
    }
    if (process.env.DATABASE_URL !== ${JSON.stringify(LOCAL_DB_URL)}) bad.push('DATABASE_URL');
    if (process.env.DIRECT_DATABASE_URL !== ${JSON.stringify(LOCAL_DB_URL)}) bad.push('DIRECT_DATABASE_URL');
    if (!String(process.env.CLERK_SECRET_KEY || '').startsWith('sk_test_')) bad.push('CLERK_SECRET_KEY');
    if (!String(process.env.CLERK_PUBLISHABLE_KEY || '').startsWith('pk_test_')) bad.push('CLERK_PUBLISHABLE_KEY');
    if (process.env.NODE_ENV !== 'development') bad.push('NODE_ENV');
    if (bad.length) {
      console.error('dotenv refilled: ' + bad.join(','));
      process.exit(1);
    }
  `;
  const r = spawnSync(process.execPath, ['-e', script], { cwd: dir, env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});
