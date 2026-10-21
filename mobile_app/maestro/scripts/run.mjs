// Cross-platform runner for the Maestro suite (Windows / macOS / Linux, local and CI).
//   node maestro/scripts/run.mjs [--tags smoke] [--apk path] [--flow maestro/flows/01-sign-up.yaml]
// Installs the E2E APK on the connected emulator/device (if --apk or the default build output
// exists), then runs `maestro test` with a JUnit report in maestro/.reports/.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'); // mobile_app/
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const tags = opt('tags', 'smoke');
// A real phone is often attached next to the emulator. Pin one so Maestro never drives the phone.
const device = opt('device', process.env.ANDROID_SERIAL || '');
if (device) process.env.ANDROID_SERIAL = device;
const target = opt('flow', 'maestro');
const apk = opt('apk', join(root, 'maestro', '.artifacts', 'app-e2e.apk'));
const reports = join(root, 'maestro', '.reports');

function run(cmd, cmdArgs) {
  const r = spawnSync(cmd, cmdArgs, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.error) {
    console.error(`Could not run "${cmd}": ${r.error.message}`);
    return 127;
  }
  return r.status ?? 1;
}

if (run('maestro', ['--version']) !== 0) {
  console.error('Maestro CLI not found. Install: https://docs.maestro.dev/getting-started/installing-maestro');
  process.exit(2);
}

if (existsSync(apk)) {
  console.log(`Installing ${apk}`);
  const adbArgs = [...(device ? ['-s', device] : []), 'install', '-r', '-d', apk];
  if (run('adb', adbArgs) !== 0) process.exit(3);
} else {
  console.warn(`No APK at ${apk}; testing whatever build is already installed (run "npm run e2e:build:android" first).`);
}

mkdirSync(reports, { recursive: true });

// Every flow books the first field at the same slot. The API rejects a second game there,
// so run flows one at a time and clear games in between. CI can set E2E_CLEAN_CMD; --no-clean skips it.
const clean = !args.includes('--no-clean');
function cleanGames() {
  if (!clean) return;
  const status = process.env.E2E_CLEAN_CMD
    ? run(process.env.E2E_CLEAN_CMD, [])
    : spawnSync('docker', [
        'compose', '-f', 'maestro/local/docker-compose.yml', 'exec', '-T', 'postgres',
        'psql', '-U', 'joinup', '-d', 'joinup_e2e', '-c', 'TRUNCATE TABLE "Game" CASCADE',
      ], { cwd: root, stdio: 'inherit' }).status ?? 1;
  if (status !== 0) console.warn('Warning: game cleanup command failed');
}

const flowFiles = target === 'maestro'
  ? readdirSync(join(root, 'maestro', 'flows')).filter((f) => f.endsWith('.yaml')).sort()
      .map((f) => join('maestro', 'flows', f))
      .filter((f) => tags === 'all' || new RegExp(String.raw`^\s*-\s*${tags}\s*$`, 'm').test(readFileSync(join(root, f), 'utf8')))
  : [target];

let failed = 0;
for (const flow of flowFiles) {
  cleanGames();
  const name = basename(flow, '.yaml');
  const maestroArgs = [
    ...(device ? ['--device', device] : []),
    'test', flow,
    '--format', 'junit',
    '--output', join(reports, `${name}.xml`),
    '--debug-output', join(reports, 'debug', name),
  ];
  console.log(`\n=== ${name} ===`);
  if (run('maestro', maestroArgs) !== 0) failed += 1;
}
console.log(`\n${flowFiles.length - failed}/${flowFiles.length} flows passed`);
process.exit(failed ? 1 : 0);
