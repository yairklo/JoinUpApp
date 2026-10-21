import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test as base, type Page } from "@playwright/test";

export const test = base.extend({
  page: async ({ page }, use) => {
    await setupClerkTestingToken({ page });
    await use(page);
  },
});

export { expect };

export async function signIn(page: Page, email: string) {
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: email });
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("button", { name: "פתח תפריט משתמש" })).toBeVisible();
}

export async function signOut(page: Page) {
  await page.goto("/");
  await clerk.signOut({ page });
}

/** Jerusalem calendar date, days ahead of today, as YYYY-MM-DD for input type="date". */
export function jerusalemDate(daysAhead: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  const next = new Date(Date.UTC(year, month - 1, day + daysAhead));
  return next.toISOString().slice(0, 10);
}
