import { loadFixture } from "../support/fixture";
import { expect, signIn, test } from "../support/auth";

test("adult A signs in with the Clerk test user", async ({ page }) => {
  const seed = loadFixture();
  await signIn(page, seed.users.adultA.email);
  const avatar = page.getByRole("button", { name: "פתח תפריט משתמש" }).locator("img");
  await expect(avatar).toHaveAttribute("alt", /נועה|משתמש/);
  expect(await avatar.getAttribute("alt")).not.toMatch(/@/);
});
