#!/usr/bin/env node
/**
 * Publish an OTA update with the SAME env as the matching EAS build profile.
 *
 *   npm run update:production -- --message "Fix chat crash"
 *   npm run update:preview -- --message "..."
 *
 * Why this script:
 * - `eas update` does NOT apply `build.<profile>.env` from eas.json. Run bare, the bundle would miss
 *   EXPO_PUBLIC_API_URL / the Clerk key / the Sentry DSN, or pick them up from a developer's local
 *   .env — i.e. a broken or wrong production app.
 * - Metro's transform cache does not key on inlined EXPO_PUBLIC_* values, so without
 *   --clear-cache a bundle can silently carry the previous run's values (e.g. preview's Sentry
 *   environment in a production update).
 *
 * What it does: env = shell env minus any EXPO_PUBLIC_* the profile doesn't set, plus the profile
 * env, with local .env loading disabled; publishes to the profile's channel and EAS environment
 * (like builds) with a cleared cache; then uploads the update's source maps to Sentry when
 * SENTRY_AUTH_TOKEN is set. Child processes are spawned without a shell, so a --message with
 * spaces or characters like & | > is passed through verbatim.
 *
 * Must be run through npm (`npm run update:*`), which provides npm_execpath.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Pinned: a new eas-cli major must be adopted on purpose, not on the next publish.
const EAS_CLI = "eas-cli@25.2.0";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(appDir, "package.json"));
const [profileName, ...rest] = process.argv.slice(2);

function fail(msg) {
  console.error(`[eas-update] ${msg}`);
  process.exit(1);
}

if (!profileName || profileName.startsWith("-")) {
  fail('usage: npm run update:<preview|production> -- --message "..." [extra eas update args]');
}
const hasMessage = rest.some((a) => a === "--message" || a === "-m" || a.startsWith("--message="));
if (!hasMessage) fail('pass --message "what changed" so the update is identifiable in EAS and Sentry');
if (rest.some((a) => a === "--input-dir" || a.startsWith("--input-dir=") || a === "--skip-bundler")) {
  fail("--input-dir / --skip-bundler are not supported here (the Sentry upload reads ./dist from this export)");
}

const eas = JSON.parse(readFileSync(join(appDir, "eas.json"), "utf8"));
const profile = eas.build?.[profileName];
if (!profile) fail(`no build profile "${profileName}" in eas.json`);
if (!profile.channel) fail(`build profile "${profileName}" has no "channel" in eas.json`);
const profileEnv = profile.env || {};
for (const key of ["EXPO_PUBLIC_API_URL", "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"]) {
  if (!profileEnv[key]) fail(`build profile "${profileName}" is missing ${key}; refusing to publish a bundle without it`);
}

// Uncommitted code would ship to users with no commit to trace it back to.
const allowDirty = rest.includes("--allow-dirty");
const easArgs = rest.filter((a) => a !== "--allow-dirty");
const git = spawnSync("git", ["status", "--porcelain", "--", "."], { cwd: appDir, encoding: "utf8" });
if (git.status === 0 && git.stdout.trim() && !allowDirty) {
  fail(`mobile_app has uncommitted changes; commit them first (or pass --allow-dirty):\n${git.stdout}`);
}

const npxCli = process.env.npm_execpath ? join(dirname(process.env.npm_execpath), "npx-cli.js") : null;
if (!npxCli) fail("run this through npm: npm run update:<profile> -- --message \"...\"");

const env = {};
for (const [k, v] of Object.entries(process.env)) {
  if (k.startsWith("EXPO_PUBLIC_") && !(k in profileEnv)) continue; // never leak shell/dev values
  env[k] = v;
}
Object.assign(env, profileEnv, { EXPO_NO_DOTENV: "1" });

function run(label, args) {
  console.log(`[eas-update] ${label}`);
  const res = spawnSync(process.execPath, args, { cwd: appDir, env, stdio: "inherit" });
  if (res.error) fail(`${label} could not start: ${res.error.message}`);
  return res.status ?? 1;
}

const environment = profile.environment || profileName;
console.log(`[eas-update] profile=${profileName} channel=${profile.channel} environment=${environment} api=${profileEnv.EXPO_PUBLIC_API_URL}`);
const published = run(`${EAS_CLI} update --channel ${profile.channel}`, [
  npxCli, "--yes", EAS_CLI, "update",
  "--channel", profile.channel,
  "--environment", environment,
  "--clear-cache",
  "--non-interactive",
  ...easArgs,
]);
if (published !== 0) process.exit(published);

if (!env.SENTRY_AUTH_TOKEN) {
  console.warn("[eas-update] SENTRY_AUTH_TOKEN not set: source maps for this update were NOT uploaded; Sentry stack traces from it will be minified.");
} else {
  const upload = run("sentry-expo-upload-sourcemaps dist", [
    require.resolve("@sentry/react-native/scripts/expo-upload-sourcemaps.js"),
    "dist",
  ]);
  if (upload !== 0) fail("the update IS published, but uploading its source maps to Sentry failed (re-run: npx sentry-expo-upload-sourcemaps dist)");
}
