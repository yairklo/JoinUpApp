import fs from "node:fs";
import path from "node:path";

export type SeedUser = {
  key: string;
  id: string;
  email: string;
  name: string;
  role: string;
  code: string;
};

export type SeedFixture = {
  version: number;
  verificationCode: string;
  users: {
    adultA: SeedUser;
    adultB: SeedUser;
    minorC: SeedUser;
    organizerO: SeedUser;
  };
  games: Record<string, { id: string; title?: string; joinPolicy?: string; isFriendsOnly?: boolean }>;
  series: {
    weekly: { id: string; title: string };
    blocked: { id: string; title: string };
  };
  chats: {
    adultMinor: { id: string };
    group: { id: string };
  };
  fields?: Record<string, { id: string; name: string }>;
};

export function loadFixture(): SeedFixture {
  const file =
    process.env.SEED_FIXTURE ||
    path.resolve(__dirname, "../../server/fixtures/devSeed.json");
  if (!fs.existsSync(file)) {
    throw new Error(
      `Missing seed fixture at ${file}. The Playwright global setup runs server/scripts/seedDev.js, which writes this file. ` +
        "For a remote dev API set DATABASE_URL to the Neon dev branch and leave E2E_SKIP_SEED unset."
    );
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as SeedFixture;
}

export const API_URL = process.env.API_URL || "http://127.0.0.1:3005";

export const EMAIL_SHAPED = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

/** Gated adult→minor messages are fail-closed unless the API has a moderation model key. */
export const moderationReady = process.env.E2E_MODERATION_READY === "1";
