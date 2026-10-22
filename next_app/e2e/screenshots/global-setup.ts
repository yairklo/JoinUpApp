import { clerkSetup } from "@clerk/testing/playwright";

/**
 * Clerk testing token only. No database, no seed, no local servers.
 * Refuses live keys. Never prints secret values.
 */
export default async function globalSetup() {
  const secret = process.env.CLERK_SECRET_KEY || "";
  const publishable =
    process.env.CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "";

  if (!secret.startsWith("sk_test_")) {
    throw new Error(
      "CLERK_SECRET_KEY must be a Clerk development key (sk_test_). Live keys are refused. " +
        "Export it in the shell, or leave it in server/.env.maestro (gitignored) for screens:web to load."
    );
  }
  if (!publishable.startsWith("pk_test_")) {
    throw new Error("CLERK_PUBLISHABLE_KEY / NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must be pk_test_.");
  }
  if (!process.env.CLERK_PUBLISHABLE_KEY) process.env.CLERK_PUBLISHABLE_KEY = publishable;

  await clerkSetup();
}
