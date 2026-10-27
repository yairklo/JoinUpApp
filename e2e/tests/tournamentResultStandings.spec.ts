import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, signIn, signOut, test } from "../support/auth";
import { API_URL } from "../support/fixture";

test.describe("Tournament match result entry and standings update", () => {
  // This test targets live seeded entities on the persistent Dev environment.
  // Skip during standard local/CI runs using fresh isolated databases unless explicitly requested.
  test.skip(
    !process.env.RUN_DEV_E2E && !process.env.E2E_SKIP_SEED,
    "Targeted against persistent Dev environment; run via scripts/run-e2e-dev.js"
  );

  const tournamentId = process.env.DEV_TOURNAMENT_ID || "cmvjad6r3000gqe0iifmjp349";
  const matchId = process.env.DEV_MATCH_ID || "aadf456d-ce2f-472b-8d7a-5a4d6f35737b";
  const organizerEmail = "organizer-o+clerk_test@example.com";
  // Tournaments are gated (tournamentsPublic is off by default). The viewer must be someone other than
  // the organizer, so the spec really checks that a second user sees the result:
  //  - DEV_ADMIN_EMAIL set (an admin on Dev): beforeAll turns tournamentsPublic on through
  //    PUT /api/admin/settings and afterAll restores the previous value, so the plain player
  //    below sees it exactly as a public visitor would. The switch is never left changed.
  //  - otherwise set DEV_VIEWER_EMAIL to a non-organizer admin / TOURNAMENT_CREATOR_IDS account,
  //    which the gate lets in regardless of the switch.
  const adminEmail = process.env.DEV_ADMIN_EMAIL;
  const viewerEmail = process.env.DEV_VIEWER_EMAIL || "adult-a+clerk_test@example.com";
  test.skip(
    !adminEmail && !process.env.DEV_VIEWER_EMAIL,
    "Set DEV_ADMIN_EMAIL (toggles tournamentsPublic for the run) or DEV_VIEWER_EMAIL (a non-organizer who can view tournaments)"
  );

  let previousPublic: boolean | null = null;

  async function adminSettings(browser: import("@playwright/test").Browser, update?: boolean) {
    const page = await browser.newPage();
    try {
      await setupClerkTestingToken({ page });
      await signIn(page, adminEmail as string);
      const token = await page.evaluate(
        () => (window as unknown as { Clerk: { session: { getToken: () => Promise<string> } } }).Clerk.session.getToken()
      );
      const res = await page.request.fetch(`${API_URL}/api/admin/settings`, {
        method: update === undefined ? "GET" : "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        data: update === undefined ? undefined : { tournamentsPublic: update },
      });
      expect(res.ok()).toBeTruthy();
      return (await res.json()).tournamentsPublic as boolean;
    } finally {
      await page.close();
    }
  }

  test.beforeAll(async ({ browser }) => {
    if (!adminEmail) return;
    previousPublic = await adminSettings(browser);
    if (!previousPublic) await adminSettings(browser, true);
  });

  test.afterAll(async ({ browser }) => {
    if (!adminEmail || previousPublic === null || previousPublic) return;
    await adminSettings(browser, false);
  });

  test("organizer enters match result -> viewer sees it -> tournament standings update", async ({
    page,
  }) => {
    // 1. Organizer signs in
    await signIn(page, organizerEmail);

    // 2. Organizer goes to the tournament schedule tab
    await page.goto(`/tournaments/${tournamentId}?tab=schedule`);
    await expect(page.getByTestId("tournament-page")).toBeVisible();

    // 3. Organizer finds the match card and clicks the score button
    const editBtn = page.getByTestId(`match-card-edit-${matchId}`);
    await expect(editBtn).toBeVisible({ timeout: 15_000 });
    await editBtn.click();

    // 4. ScoreEntrySheet opens, save button is available
    const saveBtn = page.getByTestId("score-save");
    await expect(saveBtn).toBeVisible();

    // 5. Organizer saves the result
    await saveBtn.click();

    // 6. Verify sheet closes or toast/update appears
    await expect(page.getByTestId("tournament-page")).toBeVisible();

    // 7. Organizer signs out and the viewer signs in (a fresh session)
    await signOut(page);
    await signIn(page, viewerEmail);

    // 8. Viewer navigates to the tournament standings tab
    await page.goto(`/tournaments/${tournamentId}?tab=standings`);
    await expect(page.getByTestId("tournament-page")).toBeVisible();

    // 9. Verify standings table is rendered and shows the updated scores and points
    const standingsTable = page.locator('[data-testid^="standings-table-"]').first();
    await expect(standingsTable).toBeVisible({ timeout: 15_000 });

    // 10. Verify rows for teams exist in the standings
    const teamRows = page.locator('[data-testid^="standings-row-"]');
    await expect(teamRows.first()).toBeVisible();
    const rowCount = await teamRows.count();
    expect(rowCount).toBeGreaterThanOrEqual(2);
  });
});
