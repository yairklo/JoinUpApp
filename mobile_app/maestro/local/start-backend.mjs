// Starts the full local E2E backend: throwaway Postgres (Docker) -> migrate -> seed fields -> API on :3005.
//   node maestro/local/start-backend.mjs          # start (foreground, Ctrl+C to stop)
//   node maestro/local/start-backend.mjs --reset  # wipe DB first (tmpfs: `docker compose down`)
// Clerk DEVELOPMENT keys: see maestro/scripts/clerk-keys.mjs (env, E2E_CLERK_KEYS_FILE, or local/.env.e2e).
// The Android emulator reaches this server at http://10.0.2.2:3005.
//
// server/index.js and server/lib/prisma.js call dotenv.config() with no override, which loads
// server/.env from the server cwd. dotenv does not replace keys that already exist, even when the
// value is an empty string. Spreading process.env is not enough: an unset REDIS_URL (or any other
// prod service key) would be filled from that file, and a shell value would be passed through.
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { loadClerkKeys } from '../scripts/clerk-keys.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..', '..');
const server = join(repo, 'server');
const compose = join(here, 'docker-compose.yml');
const sh = process.platform === 'win32';

// Local throwaway Postgres from maestro/local/docker-compose.yml. Never inherit a Neon/prod URL.
export const LOCAL_DB_URL = 'postgresql://joinup:joinup@localhost:5544/joinup_e2e?schema=public';

// Prod-service variables server/ (or a library it loads) actually reads. Set to '' so neither the
// parent shell nor server/.env can point this process at production.
// No email-provider variables are read by server/. Push is Firebase Admin; the Expo client is
// constructed with no access token, and EXPO_ACCESS_TOKEN is blanked so a prod token cannot linger.
export const BLOCKED_PROD_ENV_KEYS = [
  'REDIS_URL', // index.js, moderationService.js, reviewWorker.js — pub/sub + scheduler channels
  'SENTRY_DSN', // lib/sentry.js
  'SENTRY_AUTH_TOKEN', // not read at runtime; a prod token in server/.env must not be inherited
  'SENTRY_ENVIRONMENT',
  'CLOUDINARY_URL', // middleware/upload.js; the Cloudinary SDK also reads this on config()
  'CLOUDINARY_ACCOUNT_URL', // cloudinary SDK
  'CLOUDINARY_API_PROXY', // cloudinary SDK
  'FIREBASE_SERVICE_ACCOUNT_PATH', // notificationService.js
  'FIREBASE_PROJECT_ID',
  'FIREBASE_PRIVATE_KEY',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_CONFIG', // firebase-admin application default
  'GOOGLE_APPLICATION_CREDENTIALS', // firebase-admin application default
  'OPENAI_API_KEY', // moderationService.js
  'GOOGLE_API_KEY', // moderationService.js (Gemini)
  'EXPO_ACCESS_TOKEN', // push; Expo client does not read it unless passed in
  'PUBLIC_SERVER_URL', // upload absolute URLs; must not advertise the production origin
  'JWT_SECRET', // routes/auth.js legacy JWT; empty falls back to the dev placeholder
  'DOTENV_KEY', // dotenv vault would inject every other secret from .env.vault
];

export function assertClerkDevKeys(pub, secret) {
  // Never interpolate the key into the message.
  if (typeof secret !== 'string' || !secret.startsWith('sk_test_')) {
    throw new Error('Refusing to start: CLERK_SECRET_KEY must start with sk_test_ (Clerk development instance).');
  }
  if (typeof pub !== 'string' || !pub.startsWith('pk_test_')) {
    throw new Error('Refusing to start: CLERK_PUBLISHABLE_KEY must start with pk_test_ (Clerk development instance).');
  }
}

export function buildE2EBackendEnv(parentEnv, clerk, dbUrl = LOCAL_DB_URL) {
  assertClerkDevKeys(clerk?.pub, clerk?.secret);
  const blocked = Object.fromEntries(BLOCKED_PROD_ENV_KEYS.map((key) => [key, '']));
  const env = {
    ...parentEnv,
    ...blocked,
    DATABASE_URL: dbUrl,
    DIRECT_DATABASE_URL: dbUrl,
    CLERK_SECRET_KEY: clerk.secret,
    CLERK_PUBLISHABLE_KEY: clerk.pub,
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: clerk.pub,
    // Disk uploads are the local stand-in for Cloudinary. development also satisfies upload.js
    // if this flag is ever dropped; a production NODE_ENV from the shell or server/.env must not stick.
    ALLOW_DISK_UPLOADS: 'true',
    NODE_ENV: 'development',
    PORT: '3005',
  };
  if (!/^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1)[:/]/.test(env.DATABASE_URL)) {
    throw new Error('Refusing to start: DATABASE_URL must point at a localhost E2E Postgres.');
  }
  for (const key of BLOCKED_PROD_ENV_KEYS) {
    if (env[key] !== '') {
      throw new Error(`Refusing to start: ${key} must be blank for the local E2E backend.`);
    }
  }
  return env;
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

function main() {
  const { pub, secret } = loadClerkKeys();
  // --ci: the job's Postgres service already runs (E2E_DATABASE_URL); no Docker, API detached-friendly.
  const ci = process.argv.includes('--ci');
  let env;
  try {
    env = buildE2EBackendEnv(process.env, { pub, secret }, ci ? process.env.E2E_DATABASE_URL : LOCAL_DB_URL);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  function run(cmd, args, cwd) {
    const r = spawnSync(cmd, args, { cwd, env, stdio: 'inherit', shell: sh });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }

  if (!ci && process.argv.includes('--reset')) run('docker', ['compose', '-f', compose, 'down', '-v'], here);
  if (!ci) run('docker', ['compose', '-f', compose, 'up', '-d', '--wait'], here);
  run('npx', ['prisma', 'migrate', 'deploy'], server);
  run('npx', ['prisma', 'generate'], server);
  run('node', ['scripts/importFieldsFromCsv.js', '../weplay_courts_export.csv'], server);

  const api = spawn('node', ['index.js'], { cwd: server, env, stdio: 'inherit', shell: false });
  api.on('exit', (code) => process.exit(code ?? 0));
}

if (isDirectRun()) main();
