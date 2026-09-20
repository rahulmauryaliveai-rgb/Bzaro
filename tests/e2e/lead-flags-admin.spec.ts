import { expect, test, type Page } from "@playwright/test";

/**
 * Flag → admin refund (docs/LEADS.md §4). The seller flags an accepted
 * MARKET lead; the admin refunds it; the ledger shows +1 and the balance
 * moves back. Depends on seller-leads.spec.ts having accepted a lead, or on
 * any earlier accepted lead in the seeded data.
 */

const PORT = Number(process.env.PORT ?? 3000);
const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? `lvh.me:${PORT}`;
const APEX = `http://${ROOT}`;
const PASSWORD = "devpassword123";

async function login(page: Page, email: string, next = "/dashboard") {
  await page.goto(`${APEX}/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/(dashboard|admin)/);
}

test("seller flags an accepted lead and the admin refunds the credit", async ({ page }) => {
  await login(page, "owner@pune-lighting.test");

  await page.goto(`${APEX}/dashboard/leads?type=MARKET&status=ACCEPTED`);
  const card = page
    .locator("main li")
    .filter({ hasText: "Accepted" })
    .filter({ hasNotText: "Flagged" })
    .first();
  test.skip(!(await card.isVisible().catch(() => false)), "no accepted lead to flag");
  await card.getByRole("link", { name: /^View/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/leads\/./);

  const flagButton = page.getByRole("button", { name: "Something wrong with this lead?" });
  test.skip(!(await flagButton.isVisible().catch(() => false)), "lead already flagged");
  await flagButton.click();
  await page.getByLabel("Reason").selectOption("UNREACHABLE");
  await page.getByLabel("Details (optional)").fill("Number switched off all day");
  await page.getByRole("button", { name: "Flag lead" }).click();
  // The action revalidates the page; the flag renders in its reviewed state.
  await expect(page.getByText(/Flagged \(unreachable\)/)).toBeVisible();

  const balanceBefore = await creditBalance(page);

  // Admin side.
  await page.context().clearCookies();
  await login(page, "admin@bzaro.test", "/admin");
  await page.goto(`${APEX}/admin/leads/flags`);
  const row = page.locator("main li").filter({ hasText: "Pune Lighting Co" }).first();
  await expect(row).toContainText("1 credit charged");
  await row.getByLabel("Review note").fill("Confirmed unreachable");
  await row.getByRole("button", { name: "Refund credit" }).click();

  // The local PGlite database (D24) occasionally answers the first query
  // after a transaction with a protocol error (08P01), which 500s the page.
  // A reload is a fresh connection; the refund itself has already committed.
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await page.goto(`${APEX}/admin/leads/flags?status=REFUNDED`);
    if (res?.status() === 200) break;
  }
  await expect(
    page.locator("main li").filter({ hasText: "Confirmed unreachable" }).first(),
  ).toBeVisible();

  // Seller sees the credit back.
  await page.context().clearCookies();
  await login(page, "owner@pune-lighting.test");
  expect(await creditBalance(page)).toBe(balanceBefore + 1);
  await expect(page.getByRole("row").filter({ hasText: "Refund" }).first()).toBeVisible();
});

async function creditBalance(page: Page): Promise<number> {
  await page.goto(`${APEX}/dashboard/credits`);
  const text = await page.getByText("Available now").locator("..").innerText();
  return Number(text.match(/(\d+)/)?.[1] ?? "NaN");
}
