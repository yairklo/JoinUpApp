// Cross-platform runner for the Maestro suite (Windows / macOS / Linux, local and CI).
//   node maestro/scripts/run.mjs [--tags smoke] [--apk path] [--flow maestro/flows/01-sign-up.yaml]
// Installs the E2E APK on the connected emulator/device (if --apk or the default build output
// exists), then runs `maestro test` with a JUnit report in maestro/.reports/.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'); // mobile_app/
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const tags = opt('tags', 'smoke');
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
  if (run('adb', ['install', '-r', '-d', apk]) !== 0) process.exit(3);
} else {
  console.warn(`No APK at ${apk}; testing whatever build is already installed (run "npm run e2e:build:android" first).`);
}

mkdirSync(reports, { recursive: true });
const maestroArgs = ['test', target, '--format', 'junit', '--output', join(reports, 'report.xml'), '--debug-output', join(reports, 'debug')];
if (tags && tags !== 'all' && target === 'maestro') maestroArgs.push(`--include-tags=${tags}`);
process.exit(run('maestro', maestroArgs));
