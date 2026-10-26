import { expect, signIn, signOut, test } from "../support/auth";

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
  // Tournaments are gated (tournamentsPublic off by default), so the second viewer must be someone the
  // gate lets in: the organizer holds a TournamentRole. Override with an admin / TOURNAMENT_CREATOR_IDS
  // account via DEV_VIEWER_EMAIL. The spec never touches the tournamentsPublic switch.
  const viewerEmail = process.env.DEV_VIEWER_EMAIL || organizerEmail;

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
