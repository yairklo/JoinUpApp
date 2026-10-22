import { defineConfig } from "@playwright/test";

const baseURL =
  process.env.BASE_URL || "https://join-up-app-git-dev-yair-klausners-projects.vercel.app";

/**
 * Screenshot pack against an already deployed web app.
 * Does not start Next, the API, Postgres, or Redis.
 */
export default defineConfig({
  testDir: "./screenshots",
  outputDir: "./screenshots/.artifacts/test-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: "list",
  globalSetup: require.resolve("./screenshots/global-setup"),
  use: {
    baseURL,
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    trace: "retain-on-failure",
    screenshot: "off",
    video: "off",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
