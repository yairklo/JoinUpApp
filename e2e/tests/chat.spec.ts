import { EMAIL_SHAPED, loadFixture, moderationReady } from "../support/fixture";
import { expect, signIn, signOut, test } from "../support/auth";

async function sendChat(page: import("@playwright/test").Page, text: string) {
  await expect(page.getByTestId("chat-composer")).toHaveAttribute("data-connected", "true");
  await page.getByTestId("chat-input").fill(text);
  await page.getByTestId("chat-send").click();
}

test("private adult to minor: slur blocked, ordinary message delivered", async ({ page }) => {
  const seed = loadFixture();
  const room = `/chat/${seed.chats.adultMinor.id}`;
  const ordinary = "רק שואל אם את מגיעה למשחק";

  await signIn(page, seed.users.adultA.email);
  await page.goto(room);
  await sendChat(page, "זונה");
  const blocked = page.getByTestId("message-bubble").filter({ hasText: "זונה" });
  await expect(blocked).toHaveAttribute("data-message-status", "blocked");
  await expect(page.getByTestId("message-blocked")).toBeVisible();

  await sendChat(page, ordinary);
  const delivered = page.getByTestId("message-bubble").filter({ hasText: ordinary });
  await expect(delivered).toHaveAttribute("data-message-status", /sent|delivered|read/);

  await signOut(page);
  await signIn(page, seed.users.minorC.email);
  await page.goto(room);
  await expect(page.getByText("היי מאיה, נתראה במגרש?")).toBeVisible();
  await expect(page.getByText(ordinary)).toBeVisible();
  await page.reload();
  await expect(page.getByText(ordinary)).toBeVisible();
  await expect(page.getByText("זונה")).toHaveCount(0);
  const bubbles = page.getByTestId("message-bubble");
  const count = await bubbles.count();
  for (let i = 0; i < count; i += 1) {
    expect(await bubbles.nth(i).innerText()).not.toMatch(EMAIL_SHAPED);
  }
});

test("meeting request, phone, and link are delivered when moderation is configured", async ({ page }) => {
  test.skip(
    !moderationReady,
    "Set OPENAI_API_KEY or GOOGLE_API_KEY on the API and E2E_MODERATION_READY=1. Adult A is not friends with minor C, so gated messages fail closed without a model."
  );
  const seed = loadFixture();
  const room = `/chat/${seed.chats.adultMinor.id}`;
  const samples = ["ניפגש מחר אחרי המשחק", "הטלפון שלי 0501234567", "https://example.com/map"];

  await signIn(page, seed.users.adultA.email);
  await page.goto(room);
  for (const text of samples) {
    await sendChat(page, text);
    await expect(page.getByTestId("message-bubble").filter({ hasText: text })).toHaveAttribute(
      "data-message-status",
      /sent|delivered|read/
    );
  }

  await signOut(page);
  await signIn(page, seed.users.minorC.email);
  await page.goto(room);
  for (const text of samples) {
    await expect(page.getByText(text)).toBeVisible();
  }
  await page.reload();
  for (const text of samples) {
    await expect(page.getByText(text)).toBeVisible();
  }
});

test("group chat does not block ordinary speech and a report is accepted", async ({ page }) => {
  const seed = loadFixture();
  const room = `/chat/${seed.chats.group.id}`;
  const text = "חרא במשחק הקבוצה";

  await signIn(page, seed.users.adultA.email);
  await page.goto(room);
  await sendChat(page, text);
  const mine = page.getByTestId("message-bubble").filter({ hasText: text });
  await expect(mine).toHaveAttribute("data-message-status", /sent|delivered|read/);

  await signOut(page);
  await signIn(page, seed.users.minorC.email);
  await page.goto(room);
  const bubble = page.getByTestId("message-bubble").filter({ hasText: "נתראה במשחק הקבוצה" });
  await expect(bubble).toBeVisible();
  await expect(page.getByText(text)).toBeVisible();
  await bubble.hover();
  await bubble.getByTestId("message-actions").click();
  await page.getByTestId("report-message").click();
  await page.getByTestId("report-submit").click();
  await expect(page.getByText("הדיווח נשלח")).toBeVisible();
});
