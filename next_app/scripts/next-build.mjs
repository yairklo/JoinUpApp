#!/usr/bin/env node
/**
 * Runs `next build` with Clerk env that passes @clerk publishable-key
 * format checks. Quality-gate runners sometimes inject placeholders like
 * `pk_test_quality_gate_placeholder` that compile but fail prerender.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BUILD_PLACEHOLDER_PUBLISHABLE_KEY =
  "pk_test_Y2xlcmsuam9pbnVwLmxvY2FsJA"; // base64("clerk.joinup.local$")

function isValidPublishableKey(key) {
  if (!key || typeof key !== "string") return false;
  const match = key.match(/^pk_(test|live)_(.+)$/);
  if (!match) return false;
  try {
    const decoded = Buffer.from(match[2], "base64").toString("utf8");
    return decoded.endsWith("$");
  } catch {
    return false;
  }
}

const env = { ...process.env };

if (!isValidPublishableKey(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)) {
  env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = BUILD_PLACEHOLDER_PUBLISHABLE_KEY;
}

env.CLERK_SECRET_KEY ||= "sk_test_local_build_placeholder";
env.NEXT_PUBLIC_CLERK_SIGN_IN_URL ||= "/sign-in";
env.NEXT_PUBLIC_CLERK_SIGN_UP_URL ||= "/sign-up";

const nextBin = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "node_modules",
  "next",
  "dist",
  "bin",
  "next"
);

const result = spawnSync(process.execPath, [nextBin, "build"], {
  stdio: "inherit",
  env,
});

process.exit(result.status ?? 1);
