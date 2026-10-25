import { API_URL, loadFixture } from "../support/fixture";
import { expect, test } from "../support/auth";

test.describe("logged out", () => {
  test("home is Hebrew RTL", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "he");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });

  test("friends-only game, group, and team pages redirect to sign-in", async ({ page }) => {
    const seed = loadFixture();
    // Public game pages are viewable signed-out (see the guest read-only test below).
    const targets = [
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

    // Public game by id is anonymous (sanitized guest view); friends-only asks the guest to sign in.
    const byId = await request.get(`${API_URL}/api/games/${seed.games.tlvSoccer.id}`);
    expect(byId.status()).toBe(200);
    expectGuestSafe(await byId.json(), seed);
    const withMinor = await request.get(`${API_URL}/api/games/${seed.games.groupChat.id}`);
    expect(withMinor.status()).toBe(200);
    const withMinorBody = await withMinor.json();
    expectGuestSafe(withMinorBody, seed);
    expect(withMinorBody.participants.map((p: { id: string }) => p.id)).not.toContain(seed.users.minorC.id);
    const friendsOnly = await request.get(`${API_URL}/api/games/${seed.games.friendsBlocked.id}`);
    expect(friendsOnly.status()).toBe(401);
    expect((await friendsOnly.json()).code).toBe("SIGN_IN_REQUIRED");
    const seriesById = await request.get(`${API_URL}/api/series/${seed.series.weekly.id}`);
    expect(seriesById.status()).toBe(401);
    const list = await request.get(`${API_URL}/api/games`);
    expect(list.status()).toBe(200);
    const activeSeries = await request.get(`${API_URL}/api/series/active`);
    expect(activeSeries.status()).toBe(200);
  });

  test("a public game page is read-only for guests with a sign-in Join CTA", async ({ page }) => {
    const seed = loadFixture();
    const id = seed.games.tlvSoccer.id;
    await page.goto(`/games/${id}`);
    await expect(page).toHaveURL(new RegExp(`/games/${id}$`));
    await expect(page.getByText(seed.games.tlvSoccer.title || "כדורגל תל אביב").first()).toBeVisible();
    const join = page.getByTestId("guest-join-cta");
    await expect(join).toBeVisible();
    await expect(join).toHaveAttribute("href", `/sign-in?redirect_url=/games/${id}`);
    await expect(page.getByTestId("guest-sign-in")).toHaveAttribute("href", `/sign-in?redirect_url=/games/${id}`);
  });
});

const FORBIDDEN_GUEST_KEYS = ["email", "phone", "phoneNumber", "birthDate"];

/** No contact data or birth dates anywhere in a guest response, and no seeded email in any value. */
function expectGuestSafe(body: unknown, seed: ReturnType<typeof loadFixture>) {
  const keys = new Set<string>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      for (const [k, child] of Object.entries(v)) {
        keys.add(k);
        walk(child);
      }
    }
  };
  walk(body);
  for (const k of FORBIDDEN_GUEST_KEYS) expect(keys.has(k), `guest response has key "${k}"`).toBe(false);
  const raw = JSON.stringify(body);
  for (const u of Object.values(seed.users)) expect(raw).not.toContain(u.email);
  expect(raw).not.toContain(seed.users.minorC.id);
}
