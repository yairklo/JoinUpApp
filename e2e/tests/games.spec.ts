import { loadFixture } from "../support/fixture";
import { expect, jerusalemDate, signIn, signOut, test } from "../support/auth";

test("organizer creates a game", async ({ page }) => {
  const seed = loadFixture();
  await signIn(page, seed.users.organizerO.email);
  const fieldId = seed.fields?.seed_field_tlv?.id || "seed_field_tlv";
  await page.goto(`/games/new?fieldId=${fieldId}`);
  await page.getByTestId("game-title-input").fill("e2e משחק חדש");
  await page.getByTestId("game-date-input").fill(jerusalemDate(2));
  await page.getByTestId("game-time-input").fill("19:00");
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
  await row.getByTestId("approve-join").click();
  await expect(row.getByTestId("approve-join")).toHaveCount(0);

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
