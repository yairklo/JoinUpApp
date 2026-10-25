import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { writeIndex } from "./index-table.mjs";
import { screens, USERS, VIEWPORTS, mobileScreens, type ScreenAction, type ScreenDef, type ThemeName, type UserKey, type ViewportName } from "./screens";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const WEB_OUT = path.join(REPO_ROOT, "docs", "design-screens", "web");
const INDEX_PATH = path.join(REPO_ROOT, "docs", "design-screens", "INDEX.md");
const SESSION_DIR = path.join(
  process.env.SCREENSHOT_ARTIFACTS_DIR || path.join(os.tmpdir(), "joinup-design-screens"),
  "sessions"
);

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
const sessions = new Map<string, string>();

function stamp() {
  const sha = (process.env.SCREENSHOT_SHA || "unknown").slice(0, 7);
  const date = process.env.SCREENSHOT_DATE || new Date().toISOString().slice(0, 10);
  return `${sha} ${date}`;
}

async function signInOnce(browser: Browser, user: UserKey, file: string) {
  const context = await browser.newContext({ locale: "he-IL", timezoneId: "Asia/Jerusalem" });
  try {
    const page = await context.newPage();
    await setupClerkTestingToken({ page });
    // Let the first (dev) compile settle before signing in, otherwise Next's reload
    // destroys the execution context mid clerk.signIn.
    await page.goto("/tournaments", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
    // Fail fast (and let the caller retry on a fresh context) if the dev server's layout chunk timed out.
    await page.waitForFunction(() => Boolean((window as unknown as { Clerk?: { loaded?: boolean } }).Clerk?.loaded), null, {
      timeout: 30_000,
    });
    await clerk.loaded({ page });
    await clerk.signIn({ page, emailAddress: USERS[user] });
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await context.storageState({ path: file });
  } finally {
    await context.close();
  }
}

async function storageFor(browser: Browser, user: Exclude<UserKey, "guest">) {
  const cached = sessions.get(user);
  if (cached) return cached;
  fs.mkdirSync(SESSION_DIR, { recursive: true });
  const file = path.join(SESSION_DIR, `${user}.json`);
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await signInOnce(browser, user, file);
      sessions.set(user, file);
      return file;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    }
  }
  throw lastError;
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
  if (screen.id === "home-managed") {
    await page.getByRole("heading", { name: "הניהול שלי" }).waitFor({ timeout });
    // Lazy home sections only load once scrolled into view.
    for (let y = 0; y <= 4000; y += 500) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await page.waitForTimeout(300);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    return;
  }
  if (screen.user === "guest") {
    // Public game pages render read-only for guests (no redirect). Upcoming games show the
    // sign-in Join CTA; finished ones hide it, so wait for the location card's share button.
    await page.getByRole("button", { name: "שיתוף" }).first().waitFor({ timeout });
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
    return;
  }
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
  if (screen.id === "tournaments-new" || screen.id.startsWith("tournaments-new-step")) {
    await page.getByLabel(/שם הטורניר/).waitFor({ timeout });
    return;
  }
  if (screen.id === "tournament-manage") {
    await page.getByTestId("manage-console").waitFor({ timeout });
    return;
  }
  if (screen.id.startsWith("tournament-")) {
    await page.getByTestId("tournament-page").waitFor({ timeout });
  }
}

/** Network idle, no skeletons/spinners, short paint buffer. Safe to call after every navigation/action. */
async function settle(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => undefined);
  await page
    .waitForFunction(
      () =>
        !document.querySelector(
          "main .MuiSkeleton-root, [data-testid='tournament-page'] .MuiSkeleton-root, [role='dialog'] .MuiSkeleton-root"
        ),
      null,
      { timeout: 20_000 }
    )
    .catch(() => undefined);
  await page
    .waitForFunction(
      () => {
        const nodes = Array.from(document.querySelectorAll("main .MuiCircularProgress-root"));
        return nodes.every((node) => {
          const rect = (node as HTMLElement).getBoundingClientRect();
          return rect.width === 0 || rect.height === 0 || getComputedStyle(node as HTMLElement).visibility === "hidden";
        });
      },
      null,
      { timeout: 20_000 }
    )
    .catch(() => undefined);
  await page.waitForTimeout(700);
}

async function openFinishedGame(page: Page) {
  await page.getByRole("tab", { name: "היסטוריית משחקים" }).click({ timeout: 25_000 });
  await settle(page);
  await page.getByText("QA results A").first().click({ timeout: 25_000 });
  await page.waitForURL(/\/games\//, { timeout: 25_000 });
  await page.locator('[data-testid^="game-result"]').first().waitFor({ timeout: 25_000 });
  await settle(page);
}

async function wizardStep(page: Page, step: number) {
  await page.getByLabel(/שם הטורניר/).fill("גביע השכונה", { timeout: 25_000 });
  await page.locator('input[type="datetime-local"]').first().fill("2026-11-20T18:00");
  for (let i = 1; i < step; i++) {
    await page.getByRole("button", { name: "הבא", exact: true }).click({ timeout: 15_000 });
    await page.waitForTimeout(400);
  }
}

/** Runs the screen's pre-capture interaction. Returns true when a dialog is open (viewport-only shot). */
async function runAction(page: Page, action: ScreenAction): Promise<boolean> {
  switch (action) {
    case "profile-history":
      await page.getByRole("tab", { name: "היסטוריית משחקים" }).click({ timeout: 25_000 });
      await settle(page);
      await page.getByText("QA results A").first().waitFor({ timeout: 25_000 });
      return false;
    case "finished-game":
      await openFinishedGame(page);
      return false;
    case "report-user":
      await openFinishedGame(page);
      await page.getByRole("button", { name: /^דווח על / }).first().click({ timeout: 25_000 });
      await page.getByRole("dialog").waitFor({ timeout: 15_000 });
      await settle(page);
      return true;
    case "wizard-step-2":
    case "wizard-step-3":
    case "wizard-step-4":
    case "wizard-step-5":
      await wizardStep(page, Number(action.slice(-1)));
      await settle(page);
      return false;
    case "match-score-entry":
      await page.locator('[data-testid^="match-card-edit-"]').first().click({ timeout: 25_000 });
      await page.getByRole("dialog").or(page.getByTestId("score-sheet-drawer")).first().waitFor({ timeout: 15_000 });
      await settle(page);
      return true;
  }
}

async function shoot(context: BrowserContext, screen: ScreenDef, viewport: ViewportName, theme: ThemeName) {
  const screenId = `${screen.id}-${viewport}`;
  const file = path.join(WEB_OUT, screen.feature, `${screenId}-${theme}.png`);
  // Stale-file rule: never leave an old PNG behind if this capture fails.
  fs.rmSync(file, { force: true });
  const row = { id: screenId, platform: "web" as const, route: screen.route, source: screen.source, theme };
  const page = await context.newPage();
  try {
    await setupClerkTestingToken({ page });
    await page.goto(screen.route, { waitUntil: "domcontentloaded" });
    await applyTheme(page, theme);
    let landed: string | null;
    if (screen.action) {
      landed = new URL(page.url()).pathname;
    } else {
      landed = await openDetail(page, screen);
    }
    if (landed === null) return;
    await waitReady(page, screen);
    await settle(page);
    let dialogOpen = false;
    if (screen.action) {
      dialogOpen = await runAction(page, screen.action);
      landed = new URL(page.url()).pathname;
    }
    if (theme === "dark") await applyTheme(page, theme);
    // Hide the Next dev-server indicator badge when capturing against `next dev`.
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => undefined);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file, fullPage: !dialogOpen });
    updates.push({ ...row, route: landed, captured: stamp() });
  } catch (error) {
    fs.rmSync(file, { force: true });
    updates.push({ ...row, captured: "failed" });
    throw error;
  } finally {
    await page.close();
  }
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
          test.setTimeout(240_000);
          const storageState = screen.user === "guest" ? undefined : await storageFor(browser, screen.user);
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
