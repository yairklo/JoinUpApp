import { loadFixture } from "../support/fixture";
import { expect, signIn, test } from "../support/auth";

test.describe("search", () => {
  test("list and map show a seeded soccer game", async ({ page }) => {
    const seed = loadFixture();
    await signIn(page, seed.users.adultA.email);
    await page.goto(`/search?q=${encodeURIComponent("כדורגל תל אביב")}`);
    await expect(page.getByTestId(`game-card-${seed.games.tlvSoccer.id}`)).toBeVisible();
    await expect(page.getByTestId("search-list")).toBeVisible();
    await expect(page.getByTestId("search-map")).toBeVisible();
  });

  test("mobile toggles between list and map", async ({ page }) => {
    const seed = loadFixture();
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, seed.users.adultA.email);
    await page.goto(`/search?q=${encodeURIComponent("כדורגל תל אביב")}`);
    const toggle = page.getByTestId("search-view-toggle");
    await expect(toggle).toBeVisible();
    await expect(page.getByTestId("search-list")).toBeVisible();
    await toggle.click();
    await expect(page.getByTestId("search-map")).toBeVisible();
  });
});
