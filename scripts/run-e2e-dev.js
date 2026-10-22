const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const serverEnvFile = path.resolve(__dirname, '../server/.env');
const envContent = fs.readFileSync(serverEnvFile, 'utf8');

function getEnvVal(key) {
  const match = envContent.match(new RegExp(`^${key}=["']?([^"'\\r\\n]+)`, 'm'));
  return match ? match[1].trim() : '';
}

const clerkSecret = getEnvVal('CLERK_SECRET_KEY');
const clerkPub = getEnvVal('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY') || getEnvVal('CLERK_PUBLISHABLE_KEY');

const env = {
  ...process.env,
  BASE_URL: 'https://join-up-app-git-dev-yair-klausners-projects.vercel.app',
  API_URL: 'https://joinup-dev-api.duckdns.org',
  E2E_SKIP_WEBSERVER: '1',
  E2E_SKIP_SEED: '1',
  DATABASE_URL: 'postgresql://joinup:joinup@localhost:5432/joinup_e2e',
  DIRECT_DATABASE_URL: 'postgresql://joinup:joinup@localhost:5432/joinup_e2e',
  CLERK_SECRET_KEY: clerkSecret,
  CLERK_PUBLISHABLE_KEY: clerkPub,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: clerkPub,
};

const e2eDir = path.resolve(__dirname, '../e2e');
console.log('Running Playwright test against Dev environment...');
const result = spawnSync('npx.cmd', ['playwright', 'test', 'tests/tournamentResultStandings.spec.ts'], {
  cwd: e2eDir,
  env,
  stdio: 'inherit',
  shell: true,
});

process.exit(result.status ?? 0);
