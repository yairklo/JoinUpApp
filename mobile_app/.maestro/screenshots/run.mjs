/**
 * npm run screens:mobile [-- --feature profile] [--device emulator-5554]
 *
 * --device falls back to $ANDROID_SERIAL, then Maestro's own pick (which may be
 * a physical phone). Maestro is found via $MAESTRO_BIN (executable or its bin
 * dir), then PATH, then ~/tools/maestro/bin.
 *
 * Runs the Maestro flows in this directory for light and dark.
 * Passwords come from MAESTRO_*_PASSWORD (env, E2E_CLERK_KEYS_FILE or server/.env.maestro); never printed.
 * Does not start the API. Requires the Maestro CLI and a device whose app
 * points at the Dev API. Screenshot paths are written by the flows.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(here, "../..");
const args = process.argv.slice(2);
const flagValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const feature = flagValue("--feature") ?? "";
const device = flagValue("--device") || process.env.ANDROID_SERIAL || "";

const exe = process.platform === "win32" ? "maestro.bat" : "maestro";
const resolveMaestro = () => {
  const candidates = [process.env.MAESTRO_BIN, path.join(os.homedir(), "tools", "maestro", "bin")].filter(Boolean);
  for (const c of candidates) {
    const file = fs.existsSync(c) && fs.statSync(c).isDirectory() ? path.join(c, exe) : c;
    if (fs.existsSync(file)) return file;
  }
  return "maestro";
};
const maestro = `"${resolveMaestro()}"`;

const flows = ["profile", "match-results", "tournaments"].filter((name) => !feature || name === feature);
if (flows.length === 0) {
  console.error(`Unknown feature "${feature}". Use profile, match-results, or tournaments.`);
  process.exit(2);
}

if (spawnSync(maestro, ["--version"], { shell: true, stdio: "inherit" }).status !== 0) {
  console.error("Maestro CLI not found (set MAESTRO_BIN or add it to PATH). Install: https://docs.maestro.dev/getting-started/installing-maestro");
  process.exit(2);
}

const users = {
  profile: { email: "adult-a+clerk_test@example.com", key: "MAESTRO_ADULT_A_PASSWORD" },
  "match-results": { email: "adult-a+clerk_test@example.com", key: "MAESTRO_ADULT_A_PASSWORD" },
  tournaments: { email: "organizer-o+clerk_test@example.com", key: "MAESTRO_ORGANIZER_PASSWORD" },
};

// Passwords: process env first, then E2E_CLERK_KEYS_FILE, then server/.env.maestro in this
// checkout or the main checkout (git common dir's parent). Values are never printed.
const readEnvFile = (file) => {
  const out = {};
  if (!file || !fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
};
const mainCheckout = (() => {
  const r = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: mobileRoot, encoding: "utf8" });
  return r.status === 0 ? path.dirname(r.stdout.trim()) : "";
})();
const fileVars = [
  process.env.E2E_CLERK_KEYS_FILE,
  path.join(mobileRoot, "..", "server", ".env.maestro"),
  mainCheckout && path.join(mainCheckout, "server", ".env.maestro"),
].reduce((acc, f) => ({ ...readEnvFile(f), ...acc }), {});
const secretOf = (key) => process.env[key] || fileVars[key] || "";
const secrets = Object.values(users).map((u) => secretOf(u.key)).filter(Boolean);
const mask = (text) => secrets.reduce((t, v) => t.split(v).join("***"), text);

let failed = 0;
for (const name of flows) {
  const { email, key } = users[name];
  const password = secretOf(key);
  if (!password) {
    console.error(`Missing ${key} (process env, E2E_CLERK_KEYS_FILE or server/.env.maestro). Skipping ${name}.`);
    failed += 2;
    continue;
  }
  for (const theme of ["light", "dark"]) {
    console.log(`\n=== ${name} ${theme} ===`);
    // Command line is deliberately not printed (it carries the password); output is masked.
    const result = spawnSync(
      maestro,
      [
        ...(device ? ["--device", device] : []),
        "test",
        path.join(".maestro", "screenshots", `${name}.yaml`),
        "-e",
        `THEME=${theme}`,
        "-e",
        `EMAIL=${email}`,
        "-e",
        `PASSWORD=${password}`,
      ],
      { cwd: mobileRoot, shell: true, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
    );
    process.stdout.write(mask(result.stdout ?? ""));
    process.stderr.write(mask(result.stderr ?? ""));
    if ((result.status ?? 1) !== 0) failed += 1;
  }
}

process.exit(failed === 0 ? 0 : 1);
