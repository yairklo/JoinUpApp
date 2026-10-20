#!/usr/bin/env node
/**
 * Publish an OTA update with the SAME env as the matching EAS build profile.
 *
 *   npm run update:production -- --message "Fix chat crash"
 *   node scripts/eas-update.mjs preview --message "..."
 *
 * Why this script: `eas update` does NOT read `build.<profile>.env` from eas.json. Run bare, the
 * bundle would ship without EXPO_PUBLIC_API_URL (the app then falls back to http://localhost:3005),
 * without the Clerk key and without the Sentry DSN — i.e. a broken production app. This copies the
 * profile's env into the process, publishes to the profile's channel, then uploads the update's
 * source maps to Sentry when SENTRY_AUTH_TOKEN is set.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const [profileName, ...rest] = process.argv.slice(2);

function fail(msg) {
  console.error(`[eas-update] ${msg}`);
  process.exit(1);
}

if (!profileName || profileName.startsWith("-")) {
  fail("usage: node scripts/eas-update.mjs <development|preview|production> --message \"...\" [extra eas update args]");
}
if (!rest.includes("--message") && !rest.some((a) => a.startsWith("--message="))) {
  fail("pass --message \"what changed\" so the update is identifiable in EAS and Sentry");
}

const eas = JSON.parse(readFileSync(join(appDir, "eas.json"), "utf8"));
const profile = eas.build?.[profileName];
if (!profile) fail(`no build profile "${profileName}" in eas.json`);
if (!profile.channel) fail(`build profile "${profileName}" has no "channel" in eas.json`);

const profileEnv = profile.env || {};
for (const key of ["EXPO_PUBLIC_API_URL", "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"]) {
  if (!profileEnv[key]) fail(`build profile "${profileName}" is missing ${key}; refusing to publish a bundle without it`);
}

// Profile env wins over anything in the shell or a local .env (Expo's .env loading never
// overrides variables that are already set), so the update matches the installed build.
const env = { ...process.env, ...profileEnv };

function run(cmd, args) {
  console.log(`[eas-update] $ ${cmd} ${args.join(" ")}`);
  const res = spawnSync(cmd, args, { cwd: appDir, env, stdio: "inherit", shell: process.platform === "win32" });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

console.log(`[eas-update] profile=${profileName} channel=${profile.channel} api=${profileEnv.EXPO_PUBLIC_API_URL}`);
run("npx", ["eas-cli@latest", "update", "--channel", profile.channel, "--non-interactive", ...rest]);

if (env.SENTRY_AUTH_TOKEN) {
  run("npx", ["sentry-expo-upload-sourcemaps", "dist"]);
} else {
  console.warn("[eas-update] SENTRY_AUTH_TOKEN not set: source maps for this update were NOT uploaded; Sentry stack traces from it will be minified.");
}
