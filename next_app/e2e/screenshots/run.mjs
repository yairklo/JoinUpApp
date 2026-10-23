/**
 * npm run screens:web [-- --grep profile]
 *
 * Loads Clerk test keys from the shell, or from gitignored server/.env.maestro.
 * Does not start Next, the API, or a database. Playwright comes from e2e/.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mobileRows, webRows, writeIndex } from "./index-table.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const nextApp = path.resolve(here, "../..");
const repoRoot = path.resolve(nextApp, "..");
const e2eModules = path.join(repoRoot, "e2e", "node_modules");
const cli = path.join(e2eModules, "@playwright/test", "cli.js");

const ALLOWED_ENV = new Set([
  "CLERK_SECRET_KEY",
  "CLERK_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
]);

function maestroEnvFiles() {
  const files = [path.join(repoRoot, "server", ".env.maestro")];
  const common = spawnSync("git", ["rev-parse", "--git-common-dir"], { cwd: repoRoot, encoding: "utf8" });
  if (common.status === 0) {
    const gitDir = path.resolve(repoRoot, common.stdout.trim());
    files.push(path.join(path.resolve(gitDir, ".."), "server", ".env.maestro"));
  }
  return files;
}

function loadMaestroEnv() {
  const file = maestroEnvFiles().find((candidate) => fs.existsSync(candidate));
  if (!file) return;
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (trimmed.includes("sk_live_") || trimmed.includes("pk_live_")) {
      throw new Error("Live Clerk keys are refused. screens:web only runs with sk_test_ / pk_test_.");
    }
    const match = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && ALLOWED_ENV.has(match[1]) && !process.env[match[1]]) {
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value;
      continue;
    }
    // gitignored server/.env.maestro may be bare keys, one per line, or KEY=value.
    const secret = trimmed.match(/sk_test_\S+/);
    const publishable = trimmed.match(/pk_test_\S+/);
    if (secret && !(process.env.CLERK_SECRET_KEY || "").startsWith("sk_test_")) {
      process.env.CLERK_SECRET_KEY = secret[0];
    }
    if (publishable && !(process.env.CLERK_PUBLISHABLE_KEY || "").startsWith("pk_test_")) {
      process.env.CLERK_PUBLISHABLE_KEY = publishable[0];
    }
  }
}

function clerkKeysReady() {
  return (process.env.CLERK_SECRET_KEY || "").startsWith("sk_test_")
    && (process.env.CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "").startsWith("pk_test_");
}

function assertTestKeys() {
  const secret = process.env.CLERK_SECRET_KEY || "";
  const publishable =
    process.env.CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "";
  if (secret.startsWith("sk_live_") || publishable.startsWith("pk_live_")) {
    throw new Error("Live Clerk keys are refused. screens:web only runs with sk_test_ / pk_test_.");
  }
}

loadMaestroEnv();
assertTestKeys();
if (!clerkKeysReady()) {
  console.error("Clerk test keys were not loaded. Export sk_test_ / pk_test_ or put them in server/.env.maestro.");
  process.exit(2);
}

if (!process.env.BASE_URL) {
  process.env.BASE_URL = "https://join-up-app-git-dev-yair-klausners-projects.vercel.app";
}
if (!process.env.SCREENSHOT_SHA) {
  const sha = spawnSync("git", ["rev-parse", "--short", "origin/Dev"], { cwd: repoRoot, encoding: "utf8" });
  if (sha.status === 0) process.env.SCREENSHOT_SHA = sha.stdout.trim();
}
if (!process.env.SCREENSHOT_DATE) process.env.SCREENSHOT_DATE = new Date().toISOString().slice(0, 10);

const indexOnly = process.argv.includes("--index-only");
if (indexOnly) {
  const { screens, mobileScreens } = loadCatalog();
  writeIndex(
    path.join(repoRoot, "docs", "design-screens", "INDEX.md"),
    [...webRows(screens), ...mobileRows(mobileScreens)],
    []
  );
  process.exit(0);
}

if (!fs.existsSync(cli)) {
  console.error("Playwright is not installed. From e2e/: npm ci && npx playwright install chromium");
  process.exit(2);
}

process.env.NODE_PATH = process.env.NODE_PATH
  ? `${e2eModules}${path.delimiter}${process.env.NODE_PATH}`
  : e2eModules;

// Keep Playwright output (traces, sessions) outside next_app/: writes under the Next project dir make
// `next dev` recompile continuously, which reloads pages mid-capture ("Execution context was destroyed").
const artifacts = process.env.SCREENSHOT_ARTIFACTS_DIR || path.join(os.tmpdir(), "joinup-design-screens");
process.env.SCREENSHOT_ARTIFACTS_DIR = artifacts;
fs.mkdirSync(artifacts, { recursive: true });

const extra = process.argv.slice(2).filter((arg) => arg !== "--" && arg !== "--index-only");
const result = spawnSync(process.execPath, [cli, "test", "-c", "e2e/playwright.screenshots.config.ts", "--output", path.join(artifacts, "test-results"), ...extra], {
  cwd: nextApp,
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);

function loadCatalog() {
  const source = fs.readFileSync(path.join(here, "screens.ts"), "utf8");
  const arrayOf = (name) => {
    const match = source.match(new RegExp(`export const ${name}[\\s\\S]*?=\\s*(\\[[\\s\\S]*?\\n\\]);`));
    if (!match) throw new Error(`Could not read ${name} from screens.ts`);
    return new Function(`return ${match[1]}`)();
  };
  return { screens: arrayOf("screens"), mobileScreens: arrayOf("mobileScreens") };
}
