/**
 * npm run screens:mobile [-- --feature profile] [--device emulator-5554]
 *
 * --device falls back to $ANDROID_SERIAL, then Maestro's own pick (which may be
 * a physical phone). Maestro is found via $MAESTRO_BIN (executable or its bin
 * dir), then PATH, then ~/tools/maestro/bin.
 *
 * Runs the Maestro flows in this directory for light and dark.
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

const emails = {
  profile: "adult-a+clerk_test@example.com",
  "match-results": "organizer-o+clerk_test@example.com",
  tournaments: "organizer-o+clerk_test@example.com",
};

let failed = 0;
for (const name of flows) {
  for (const theme of ["light", "dark"]) {
    console.log(`\n=== ${name} ${theme} ===`);
    const result = spawnSync(
      maestro,
      [
        ...(device ? ["--device", device] : []),
        "test",
        path.join(".maestro", "screenshots", `${name}.yaml`),
        "-e",
        `THEME=${theme}`,
        "-e",
        `EMAIL=${emails[name]}`,
      ],
      { cwd: mobileRoot, stdio: "inherit", shell: true }
    );
    if ((result.status ?? 1) !== 0) failed += 1;
  }
}

process.exit(failed === 0 ? 0 : 1);
