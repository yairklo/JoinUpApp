// Starts the full local E2E backend: throwaway Postgres (Docker) -> migrate -> seed fields -> API on :3005.
//   node maestro/local/start-backend.mjs          # start (foreground, Ctrl+C to stop)
//   node maestro/local/start-backend.mjs --reset  # wipe DB first (tmpfs: `docker compose down`)
// Clerk DEVELOPMENT keys: see maestro/scripts/clerk-keys.mjs (env, E2E_CLERK_KEYS_FILE, or local/.env.e2e).
// The Android emulator reaches this server at http://10.0.2.2:3005.
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadClerkKeys } from '../scripts/clerk-keys.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..', '..');
const server = join(repo, 'server');
const compose = join(here, 'docker-compose.yml');
const sh = process.platform === 'win32';

const { pub: clerkPub, secret: clerkSecret } = loadClerkKeys();

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
