import fs from "node:fs";
import path from "node:path";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { writeIndex } from "./index-table.mjs";
import { screens, USERS, VIEWPORTS, mobileScreens, type ScreenDef, type ThemeName, type UserKey, type ViewportName } from "./screens";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const WEB_OUT = path.join(REPO_ROOT, "docs", "design-screens", "web");
const INDEX_PATH = path.join(REPO_ROOT, "docs", "design-screens", "INDEX.md");
const SESSION_DIR = path.resolve(__dirname, ".artifacts", "sessions");

const DARK_BODY = "rgb(11, 18, 32)";

type CaptureUpdate = {
  id: string;
  platform: "web";
  route: string;
  source: string;
  theme: ThemeName;
  captured: string;
};

const updates: CaptureUpdate[] = [];
const sessions = new Map<UserKey, string>();

function stamp() {
  const sha = (process.env.SCREENSHOT_SHA || "unknown").slice(0, 7);
  const date = process.env.SCREENSHOT_DATE || new Date().toISOString().slice(0, 10);
  return `${sha} ${date}`;
}

async function storageFor(browser: Browser, user: UserKey) {
  const cached = sessions.get(user);
  if (cached) return cached;
  fs.mkdirSync(SESSION_DIR, { recursive: true });
  const file = path.join(SESSION_DIR, `${user}.json`);
  const context = await browser.newContext({ locale: "he-IL", timezoneId: "Asia/Jerusalem" });
  const page = await context.newPage();
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: USERS[user] });
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await context.storageState({ path: file });
  await context.close();
  sessions.set(user, file);
  return file;
}

async function applyTheme(page: Page, theme: ThemeName) {
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  if (theme === "dark") {
    await page.waitForFunction(
      (expected) => getComputedStyle(document.body).backgroundColor === expected,
      DARK_BODY
    );
  }
}

function detailHref(href: string, screen: ScreenDef) {
  if (!screen.openDetailPrefix || !href.includes(screen.openDetailPrefix)) return false;
  return !(screen.openDetailSkip || []).some((skip) => href.includes(skip));
}

async function openDetail(page: Page, screen: ScreenDef) {
  if (!screen.openDetailPrefix) return new URL(page.url()).pathname;
  await page.locator(`a[href*="${screen.openDetailPrefix}"]`).first().waitFor({ timeout: 15_000 }).catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
  const hrefs = await page.locator("a[href]").evaluateAll((nodes) =>
    nodes.map((node) => (node as HTMLAnchorElement).getAttribute("href") || "")
  );
  const match = hrefs.find((href) => detailHref(href, screen));
  if (!match) {
    if (screen.optionalDetail) return null;
    if (screen.id === "game") {
      await page.goto("/search", { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
      const again = await page.locator("a[href]").evaluateAll((nodes) =>
        nodes.map((node) => (node as HTMLAnchorElement).getAttribute("href") || "")
      );
      const second = again.find((href) => detailHref(href, screen));
      if (!second) throw new Error(`No ${screen.openDetailPrefix} link on /manage or /search`);
      await page.goto(second);
      return new URL(page.url()).pathname;
    }
    throw new Error(`No detail link matching ${screen.openDetailPrefix} on ${screen.route}`);
  }
  await page.goto(match);
  return new URL(page.url()).pathname;
}

async function waitReady(page: Page, screen: ScreenDef) {
  const timeout = 25_000;
  if (screen.id === "profile") {
    await page.getByRole("button", { name: "ערוך פרופיל" }).waitFor({ timeout });
    return;
  }
  if (screen.id === "profile-minor") {
    await page.getByRole("heading", { name: /מאיה/ }).waitFor({ timeout });
    return;
  }
  if (screen.id === "profile-settings") {
    await page.getByTestId("settings-hide-match-stats").waitFor({ timeout });
    return;
  }
  if (screen.id === "tournaments-list" || screen.id === "tournament") {
    await page.getByTestId("tournaments-loading").waitFor({ state: "hidden", timeout }).catch(() => undefined);
    await page
      .getByTestId("tournaments-empty")
      .or(page.getByTestId("tournaments-error"))
      .or(page.locator("a[href*='/tournaments/']").first())
      .waitFor({ timeout })
      .catch(() => undefined);
    return;
  }
  if (screen.id === "tournaments-invites") {
    await page.getByTestId("invites-empty").or(page.getByTestId("invites-list")).waitFor({ timeout });
    return;
  }
  if (screen.id === "tournaments-new") {
    await page.getByRole("heading").first().waitFor({ timeout });
  }
}

async function shoot(context: BrowserContext, screen: ScreenDef, viewport: ViewportName, theme: ThemeName) {
  const page = await context.newPage();
  await setupClerkTestingToken({ page });
  await page.goto(screen.route, { waitUntil: "domcontentloaded" });
  await applyTheme(page, theme);
  const landed = await openDetail(page, screen);
  if (landed === null) {
    await page.close();
    return;
  }
  if (theme === "dark") await applyTheme(page, theme);
  await waitReady(page, screen);
  const screenId = `${screen.id}-${viewport}`;
  const file = path.join(WEB_OUT, screen.feature, `${screenId}-${theme}.png`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: true });
  updates.push({
    id: screenId,
    platform: "web",
    route: landed,
    source: screen.source,
    theme,
    captured: stamp(),
  });
  await page.close();
}

test.describe("design screens", () => {
  test.afterAll(() => {
    const catalog = [
      ...screens.flatMap((screen) =>
        (["desktop", "mobile"] as const).flatMap((viewport) =>
          (["light", "dark"] as const).map((theme) => ({
            id: `${screen.id}-${viewport}`,
            platform: "web",
            route: screen.route,
            source: screen.source,
            theme,
            captured: "not yet",
          }))
        )
      ),
      ...mobileScreens.flatMap((screen) =>
        (["light", "dark"] as const).map((theme) => ({
          id: screen.id,
          platform: "mobile",
          route: screen.route,
          source: screen.source,
          theme,
          captured: "not yet",
        }))
      ),
    ];
    writeIndex(INDEX_PATH, catalog, updates);
  });

  for (const screen of screens) {
    for (const viewport of Object.keys(VIEWPORTS) as ViewportName[]) {
      for (const theme of ["light", "dark"] as const) {
        test(`${screen.feature} ${screen.id} ${viewport} ${theme}`, async ({ browser }) => {
          const storageState = await storageFor(browser, screen.user);
          const context = await browser.newContext({
            storageState,
            viewport: VIEWPORTS[viewport],
            locale: "he-IL",
            timezoneId: "Asia/Jerusalem",
          });
          await context.addInitScript((mode) => {
            try {
              localStorage.setItem("joinup-color-mode", mode);
            } catch {
              /* private mode */
            }
          }, theme);
          try {
            await shoot(context, screen, viewport, theme);
          } finally {
            await context.close();
          }
        });
      }
    }
  }
});
