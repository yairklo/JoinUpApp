import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.BASE_URL || "http://127.0.0.1:3000";
const apiURL = process.env.API_URL || "http://127.0.0.1:3005";
const skipWebServer = process.env.E2E_SKIP_WEBSERVER === "1";

const serverEnv = {
  ...process.env,
  PORT: "3005",
  NODE_ENV: process.env.E2E_SERVER_NODE_ENV || "development",
  ALLOW_DISK_UPLOADS: process.env.ALLOW_DISK_UPLOADS || "true",
};

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
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
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
          env: serverEnv,
        },
        {
          command: "npm start -- -p 3000",
          cwd: path.join(__dirname, "../next_app"),
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
          env: {
            ...process.env,
            PORT: "3000",
            NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || apiURL,
          },
        },
      ],
});
