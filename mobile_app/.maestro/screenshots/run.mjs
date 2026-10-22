/**
 * npm run screens:mobile [-- --feature profile]
 *
 * Runs the Maestro flows in this directory for light and dark.
 * Does not start the API. Requires the Maestro CLI and a device whose app
 * points at the Dev API. Screenshot paths are written by the flows.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(here, "../..");
const args = process.argv.slice(2);
const featureFlag = args.indexOf("--feature");
const feature = featureFlag >= 0 ? args[featureFlag + 1] : "";

const flows = ["profile", "match-results", "tournaments"].filter((name) => !feature || name === feature);
if (flows.length === 0) {
  console.error(`Unknown feature "${feature}". Use profile, match-results, or tournaments.`);
  process.exit(2);
}

if (spawnSync("maestro", ["--version"], { shell: true, stdio: "inherit" }).status !== 0) {
  console.error("Maestro CLI not found. Install: https://docs.maestro.dev/getting-started/installing-maestro");
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
      "maestro",
      [
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
