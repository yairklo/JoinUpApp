import { loadFixture } from "../support/fixture";
import { expect, jerusalemDate, signIn, signOut, test } from "../support/auth";

// seed_game_series_next is jerusalemDatePlus(3) at 19:00 on seed_field_tlv.
// jerusalemDatePlus adds N*24h to Date.now() and formats that instant in
// Asia/Jerusalem. The fall-back at 02:00 on the last Sunday of October pulls
// that +72h date back one calendar day during 00:00–00:59, so on 2026-10-23,
// 2026-10-24, and 2026-10-25 it lands on the same court slot this test used
// to book (calendar +2 days, 19:00). The API then rejects the create with
// "השעה הזו כבר תפוסה במגרש" (exact fieldId + start). On 2026-10-25 that
// shared start is 2026-10-27 19:00 Asia/Jerusalem (2026-10-27T17:00:00.000Z).
// Day +30 at 11:00 is outside the seed, which only books +2..+6 elapsed days
// (one calendar day of DST skew at most) at 18:00, 18:30, 19:00, 19:30, 20:00,
// or 21:00.
test("organizer creates a game", async ({ page }) => {
  const seed = loadFixture();
  await signIn(page, seed.users.organizerO.email);
  const fieldId = seed.fields?.seed_field_tlv?.id || "seed_field_tlv";
  await page.goto(`/games/new?fieldId=${fieldId}`);
  await page.getByTestId("game-title-input").fill("e2e משחק חדש");
  await page.getByTestId("game-date-input").fill(jerusalemDate(30));
  await page.getByTestId("game-time-input").fill("11:00");
  const submit = page.getByTestId("create-game-submit");
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page).toHaveURL(/\/games\/(?!new)[^/]+$/);
  await expect(page.getByText("e2e משחק חדש")).toBeVisible();
});

test("adult A joins and leaves a public game", async ({ page }) => {
  const seed = loadFixture();
  await signIn(page, seed.users.adultA.email);
  await page.goto(`/games/${seed.games.tlvSoccer.id}`);
  await page.getByTestId("join-game").click();
  await expect(page.getByTestId("leave-game")).toBeVisible();
  await page.getByTestId("leave-game").click();
  await page.getByTestId("leave-confirm").click();
  await expect(page.getByTestId("join-game")).toBeVisible();
});

test("approval request is approved by the organizer", async ({ page }) => {
  const seed = loadFixture();
  await signIn(page, seed.users.adultA.email);
  await page.goto(`/games/${seed.games.approval.id}`);
  await page.getByTestId("join-game").click();
  await expect(page.getByTestId("join-pending")).toBeVisible();

  await signOut(page);
  await signIn(page, seed.users.organizerO.email);
  await page.goto(`/games/${seed.games.approval.id}`);
  const row = page
    .locator("div")
    .filter({ hasText: seed.users.adultA.name })
    .filter({ has: page.getByTestId("approve-join") })
    .last();
  // The row locator re-resolves to an ancestor once the row is gone, so compare
  // the page-wide count of pending approvals instead.
  const approveButtons = page.getByTestId("approve-join");
  await expect(approveButtons.first()).toBeVisible();
  const pendingBefore = await approveButtons.count();
  await row.getByTestId("approve-join").click();
  await expect(approveButtons).toHaveCount(pendingBefore - 1);

  await signOut(page);
  await signIn(page, seed.users.adultA.email);
  await page.goto(`/games/${seed.games.approval.id}`);
  await expect(page.getByTestId("leave-game")).toBeVisible();
});

test("friends-only games: request stays pending, blocked link stays hidden", async ({ page }) => {
  const seed = loadFixture();
  await signIn(page, seed.users.adultA.email);

  await page.goto(`/games/${seed.games.friendsRequest.id}`);
  await page.getByTestId("join-game").click();
  await expect(page.getByTestId("join-pending")).toBeVisible();

  await page.goto(`/games/${seed.games.friendsBlocked.id}`);
  await expect(page.getByTestId("game-friends-only")).toBeVisible();
  await expect(page.getByText("כדורגל חברים חסום")).toHaveCount(0);
});
