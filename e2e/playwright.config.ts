import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { explicitProcessEnv } from "./support/dbEnv";

const baseURL = process.env.BASE_URL || "http://127.0.0.1:3000";
const apiURL = process.env.API_URL || "http://127.0.0.1:3005";
const openReport = process.argv.includes("show-report");
const skipWebServer = process.env.E2E_SKIP_WEBSERVER === "1" || openReport;

// CI covers the meeting-up rule with the dev stub. A paid model key is not required.
if (process.env.CI && !process.env.MODERATION_PROVIDER) {
  process.env.MODERATION_PROVIDER = "stub";
}

const serverEnv = explicitProcessEnv(process.env, {
  PORT: "3005",
  NODE_ENV: process.env.E2E_SERVER_NODE_ENV || "development",
  ALLOW_DISK_UPLOADS: process.env.ALLOW_DISK_UPLOADS || "true",
});

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  // The seed is stateful. A retry would re-run against rows the first attempt
  // already changed and fail for the wrong reason. Re-seed is not per retry.
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: require.resolve("./global-setup"),
  use: {
    baseURL,
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: skipWebServer
    ? undefined
    : [
        {
          command: "npm start",
          cwd: path.join(__dirname, "../server"),
          url: `${apiURL}/api/health`,
          // Never attach to an already-running API: that process may have loaded server/.env.
          reuseExistingServer: false,
          timeout: 180_000,
          // Explicit env + JOINUP_SKIP_DOTENV so the API does not load server/.env.
          env: serverEnv,
        },
        {
          command: "npm start -- -p 3000",
          cwd: path.join(__dirname, "../next_app"),
          url: baseURL,
          reuseExistingServer: false,
          timeout: 180_000,
          env: {
            ...process.env,
            PORT: "3000",
            NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || apiURL,
          },
        },
      ],
});
