// Builds a release APK wired for E2E: Clerk *development* instance + a local/test backend.
//   EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...  [E2E_API_URL=http://10.0.2.2:3005]  npm run e2e:build:android
// Output: maestro/.artifacts/app-e2e.apk   (gitignored). Not an EAS build: it is meant for the
// emulator, never for distribution. The generated android/ dir is gitignored too.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const key = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
if (!key.startsWith('pk_test_')) {
  console.error('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY must be a Clerk DEVELOPMENT key (pk_test_...). '
    + 'Refusing to build an E2E app against the live Clerk instance (it would create real accounts).');
  process.exit(1);
}

const env = {
  ...process.env,
  // 10.0.2.2 is the host machine as seen from the Android emulator.
  EXPO_PUBLIC_API_URL: process.env.E2E_API_URL || 'http://10.0.2.2:3005',
  EXPO_PUBLIC_SENTRY_DSN: '',
  NODE_ENV: 'production',
};

function run(cmd, cmdArgs, cwd = root) {
  const r = spawnSync(cmd, cmdArgs, { cwd, env, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run('npx', ['expo', 'prebuild', '--platform', 'android', '--no-install']);

// The test backend is plain http (emulator -> host); release builds block cleartext by default.
const manifest = join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
let xml = readFileSync(manifest, 'utf8');
if (!xml.includes('usesCleartextTraffic')) {
  xml = xml.replace('<application ', '<application android:usesCleartextTraffic="true" ');
  writeFileSync(manifest, xml);
}

const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
run(gradlew, ['assembleRelease', '-x', 'lint'], join(root, 'android'));

const built = join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
if (!existsSync(built)) {
  console.error(`Expected APK not found at ${built}`);
  process.exit(1);
}
const out = join(root, 'maestro', '.artifacts');
mkdirSync(out, { recursive: true });
copyFileSync(built, join(out, 'app-e2e.apk'));
console.log(`E2E APK: ${join(out, 'app-e2e.apk')}`);
