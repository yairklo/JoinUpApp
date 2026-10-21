import { execSync } from "node:child_process";
import path from "node:path";
import { clerkSetup } from "@clerk/testing/playwright";
import { assertShellDatabaseUrls, explicitProcessEnv } from "./support/dbEnv";

/**
 * Resets the dev database, then prepares Clerk's testing token.
 * Refuses live keys and any database URL that was not already in the shell
 * (server/.env is not consulted here). Never prints secret values.
 */
export default async function globalSetup() {
  assertShellDatabaseUrls(process.env);

  const secret = process.env.CLERK_SECRET_KEY || "";
  const publishable =
    process.env.CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "";

  if (!secret.startsWith("sk_test_")) {
    throw new Error(
      "CLERK_SECRET_KEY must be a Clerk development key (sk_test_). " +
        "Set GitHub secret CLERK_TEST_SECRET_KEY. Live keys are refused."
    );
  }
  if (!publishable.startsWith("pk_test_")) {
    throw new Error(
      "CLERK_PUBLISHABLE_KEY / NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must be pk_test_. " +
        "Set GitHub secret CLERK_TEST_PUBLISHABLE_KEY."
    );
  }
  if (!process.env.CLERK_PUBLISHABLE_KEY) {
    process.env.CLERK_PUBLISHABLE_KEY = publishable;
  }

  if (process.env.E2E_SKIP_SEED !== "1") {
    const serverDir = path.resolve(__dirname, "../server");
    // URLs are already in this environment, so seedDev.js's dotenv load cannot
    // replace them. The child still gets an explicit env (no inherited secrets).
    execSync("node scripts/seedDev.js", {
      cwd: serverDir,
      stdio: "inherit",
      env: explicitProcessEnv(process.env),
    });
  }

  await clerkSetup();
}
