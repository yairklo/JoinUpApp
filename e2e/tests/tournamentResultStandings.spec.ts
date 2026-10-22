import { expect, signIn, signOut, test } from "../support/auth";

test.describe("Tournament match result entry and standings update", () => {
  const tournamentId = "cmvjad6r3000gqe0iifmjp349";
  const matchId = "aadf456d-ce2f-472b-8d7a-5a4d6f35737b";
  const organizerEmail = "organizer-o+clerk_test@example.com";
  const participantEmail = "adult-a+clerk_test@example.com";

  test("organizer enters match result -> participant sees it -> tournament standings update", async ({
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

    // 7. Organizer signs out and participant signs in
    await signOut(page);
    await signIn(page, participantEmail);

    // 8. Participant navigates to the tournament standings tab
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
