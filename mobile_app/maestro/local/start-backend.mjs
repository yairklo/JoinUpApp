// Starts the full local E2E backend: throwaway Postgres (Docker) -> migrate -> seed fields -> API on :3005.
//   node maestro/local/start-backend.mjs          # start (foreground, Ctrl+C to stop)
//   node maestro/local/start-backend.mjs --reset  # wipe DB first (tmpfs: `docker compose down`)
// Clerk DEVELOPMENT keys are read from maestro/local/.env.e2e (gitignored) or the environment:
//   CLERK_SECRET_KEY=sk_test_...   CLERK_PUBLISHABLE_KEY=pk_test_...
// The Android emulator reaches this server at http://10.0.2.2:3005.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..', '..');
const server = join(repo, 'server');
const compose = join(here, 'docker-compose.yml');
const sh = process.platform === 'win32';

const fileEnv = {};
const envFile = join(here, '.env.e2e');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#')) fileEnv[m[1]] = m[2];
  }
}
const clerkSecret = process.env.CLERK_SECRET_KEY || fileEnv.CLERK_SECRET_KEY || '';
const clerkPub = process.env.CLERK_PUBLISHABLE_KEY || fileEnv.CLERK_PUBLISHABLE_KEY || '';
if (!clerkSecret.startsWith('sk_test_') || !clerkPub.startsWith('pk_test_')) {
  console.error('Need Clerk DEVELOPMENT keys (sk_test_... / pk_test_...) in maestro/local/.env.e2e or the environment. '
    + 'Refusing to run against a live Clerk instance.');
  process.exit(1);
}

const dbUrl = 'postgresql://joinup:joinup@localhost:5544/joinup_e2e?schema=public';
const env = {
  ...process.env,
  DATABASE_URL: dbUrl,
  DIRECT_DATABASE_URL: dbUrl,
  CLERK_SECRET_KEY: clerkSecret,
  CLERK_PUBLISHABLE_KEY: clerkPub,
  ALLOW_DISK_UPLOADS: 'true',
  PORT: '3005',
};

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, env, stdio: 'inherit', shell: sh });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (process.argv.includes('--reset')) run('docker', ['compose', '-f', compose, 'down', '-v'], here);
run('docker', ['compose', '-f', compose, 'up', '-d', '--wait'], here);
run('npx', ['prisma', 'migrate', 'deploy'], server);
run('npx', ['prisma', 'generate'], server);
run('node', ['scripts/importFieldsFromCsv.js', '../weplay_courts_export.csv'], server);

const api = spawn('node', ['index.js'], { cwd: server, env, stdio: 'inherit', shell: false });
api.on('exit', (code) => process.exit(code ?? 0));
