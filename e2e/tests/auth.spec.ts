import { API_URL, loadFixture } from "../support/fixture";
import { expect, test } from "../support/auth";

test.describe("logged out", () => {
  test("home is Hebrew RTL", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "he");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });

  test("game, group, and team pages redirect to sign-in", async ({ page }) => {
    const seed = loadFixture();
    const targets = [
      `/games/${seed.games.tlvSoccer.id}`,
      `/games/${seed.games.friendsBlocked.id}`,
      `/series/${seed.series.weekly.id}`,
      `/series/${seed.series.blocked.id}`,
      `/games/${seed.games.tlvSoccer.id}/team-management`,
    ];
    for (const path of targets) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/sign-in/);
      expect(decodeURIComponent(page.url())).toContain("redirect_url=");
    }
  });

  test("protected API routes answer 401 and public reads keep their contract", async ({ request }) => {
    const seed = loadFixture();
    const join = await request.post(`${API_URL}/api/games/${seed.games.tlvSoccer.id}/join`);
    expect(join.status()).toBe(401);
    const mine = await request.get(`${API_URL}/api/games/my`);
    expect(mine.status()).toBe(401);
    const messages = await request.get(`${API_URL}/api/messages?roomId=${seed.chats.adultMinor.id}`);
    expect(messages.status()).toBe(401);
    const subscribe = await request.post(`${API_URL}/api/series/${seed.series.weekly.id}/subscribe`);
    expect(subscribe.status()).toBe(401);

    // By-id reads sit behind authenticateToken on main; only the list endpoints are anonymous.
    const byId = await request.get(`${API_URL}/api/games/${seed.games.tlvSoccer.id}`);
    expect(byId.status()).toBe(401);
    const seriesById = await request.get(`${API_URL}/api/series/${seed.series.weekly.id}`);
    expect(seriesById.status()).toBe(401);
    const list = await request.get(`${API_URL}/api/games`);
    expect(list.status()).toBe(200);
    const activeSeries = await request.get(`${API_URL}/api/series/active`);
    expect(activeSeries.status()).toBe(200);
  });
});
