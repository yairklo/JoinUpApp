import { EMAIL_SHAPED, loadFixture } from "../support/fixture";
import { expect, signIn, signOut, test } from "../support/auth";

test("friend request shows on the receiver bell without an email", async ({ page }) => {
  const seed = loadFixture();
  await signIn(page, seed.users.adultA.email);
  await page.goto(`/users/${seed.users.organizerO.id}`);
  await page.getByTestId("add-friend").click();
  await expect(page.getByRole("button", { name: "בקשה נשלחה" })).toBeVisible();

  await signOut(page);
  await signIn(page, seed.users.organizerO.email);
  await page.getByTestId("notifications-bell").click();
  const item = page.getByTestId("notification-item").filter({ hasText: "בקשת חברות" });
  await expect(item.first()).toBeVisible();
  await expect(item.first()).toContainText("נועה");
  expect(await item.first().innerText()).not.toMatch(EMAIL_SHAPED);
});

test("a stranger does not see a minor's private profile sections or email", async ({ page }) => {
  const seed = loadFixture();
  await signIn(page, seed.users.adultB.email);
  await page.goto(`/users/${seed.users.minorC.id}`);
  await expect(page.getByTestId("profile-name")).toHaveText(seed.users.minorC.name);
  expect(await page.getByTestId("profile-name").innerText()).not.toMatch(EMAIL_SHAPED);
  // PR #375 drops profile-email for non-owners. Older builds keep the row and
  // show a placeholder. Either way a stranger must not see an address.
  const email = page.getByTestId("profile-email");
  if ((await email.count()) === 0) {
    await expect(email).toHaveCount(0);
  } else {
    await expect(email).not.toContainText("@");
    await expect(email).not.toContainText(seed.users.minorC.email);
  }
  await expect(page.locator("main")).not.toContainText(seed.users.minorC.email);
  const sections = page.getByTestId("profile-sections");
  await expect(sections).toBeAttached();
  await expect(sections).not.toContainText("חברים");
  await expect(sections).not.toContainText("היסטוריית משחקים");
});

test("person-name regions never render an email address", async ({ page }) => {
  const seed = loadFixture();
  await signIn(page, seed.users.adultB.email);
  await page.goto(`/users/${seed.users.adultA.id}`);
  await expect(page.getByTestId("profile-name")).toHaveText(seed.users.adultA.name);
  const names = page.locator("[data-testid='profile-name'], [data-testid='notification-item']");
  const count = await names.count();
  for (let i = 0; i < count; i += 1) {
    expect(await names.nth(i).innerText()).not.toMatch(EMAIL_SHAPED);
  }
  const avatarAlt = await page.getByRole("button", { name: "פתח תפריט משתמש" }).locator("img").getAttribute("alt");
  expect(avatarAlt || "").not.toMatch(EMAIL_SHAPED);
});
