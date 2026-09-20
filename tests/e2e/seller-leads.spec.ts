import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Seller lead inbox (docs/LEADS.md §2, §4).
 *
 * Relies on the seed's lead fixtures and on at least one requirement having
 * been fanned out to them (the buyer-contact-flow spec creates requirements;
 * the worker turns them into MARKET leads). The assertions are about MASKING
 * and CREDITS, which is where a bug costs either privacy or money.
 */

const PORT = Number(process.env.PORT ?? 3000);
const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? `lvh.me:${PORT}`;
const APEX = `http://${ROOT}`;
const PASSWORD = "devpassword123";

async function login(page: Page, email: string) {
  await page.goto(`${APEX}/login`);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/dashboard/);
}

/** The first lead card of a given kind on the current inbox page, if any. */
function firstCard(page: Page, kind: "Direct" | "Market"): Locator {
  return page.locator("main li").filter({ hasText: kind }).first();
}

/** "View" / "View & accept" on a card — scoped so "View site" in the nav never matches. */
function viewLink(card: Locator): Locator {
  return card.getByRole("link", { name: /^View/ });
}

async function creditBalance(page: Page): Promise<number> {
  await page.goto(`${APEX}/dashboard/credits`);
  const text = await page.getByText("Available now").locator("..").innerText();
  return Number(text.match(/(\d+)/)?.[1] ?? "NaN");
}

test.describe("seller lead inbox", () => {
  test("a paid seller sees masked market leads, accepts one, and pays a credit", async ({
    page,
  }) => {
    await login(page, "owner@pune-lighting.test");

    await page.goto(`${APEX}/dashboard/leads?type=MARKET`);
    // Any open (NEW or VIEWED) market lead still masked.
    const card = page.locator("main li").filter({ hasText: "accept to reveal" }).first();
    test.skip(!(await card.isVisible().catch(() => false)), "no open market leads to accept");

    // The list shows the requirement only — no number, not even masked; the
    // masked number appears on the lead page, the real one after accepting.
    await expect(card).not.toContainText("XXXXX");
    await expect(card).toContainText("accept to reveal");

    await viewLink(card).click();
    await expect(page).toHaveURL(/\/dashboard\/leads\/./);
    const leadUrl = page.url();
    await expect(page.getByText("XXXXX").first()).toBeVisible();

    const before = await creditBalance(page);
    await page.goto(leadUrl);

    await page.getByRole("button", { name: /Accept lead/ }).click();
    await page.getByRole("button", { name: /Confirm/ }).click();

    // The action revalidates the page, which re-renders in its accepted
    // state: the projection now reveals the buyer, and the mask is gone.
    await expect(page.getByText("Accepted", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("XXXXX")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^\+91 \d{5} \d{5}$/ })).toBeVisible();

    const after = await creditBalance(page);
    expect(after).toBe(before - 1);
    await expect(page.getByRole("row").filter({ hasText: "Lead accepted" }).first()).toBeVisible();
  });

  test("a free-plan seller sees a blurred teaser and no accept button", async ({ page }) => {
    await login(page, "owner@noida-lights.test");

    await page.goto(`${APEX}/dashboard/leads?type=MARKET`);
    await expect(page.getByText("Market leads are waiting for you.")).toBeVisible();

    const card = firstCard(page, "Market");
    test.skip(!(await card.isVisible().catch(() => false)), "no market leads for the free seller");

    await expect(card).toContainText("available on a paid plan");
    await viewLink(card).click();
    await expect(page).toHaveURL(/\/dashboard\/leads\/./);

    await expect(page.getByRole("button", { name: /Accept lead/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "See plans" }).first()).toBeVisible();
    // The real number never reaches the page at all.
    const html = await page.content();
    expect(html).not.toMatch(/\+91 \d{5} \d{5}/);
  });

  test("a seller cannot read another seller's lead", async ({ page }) => {
    await login(page, "owner@delhi-led-house.test");
    await page.goto(`${APEX}/dashboard/leads`);
    const card = firstCard(page, "Market");
    test.skip(!(await card.isVisible().catch(() => false)), "no leads for this seller");
    const href = await viewLink(card).getAttribute("href");
    expect(href).toMatch(/^\/dashboard\/leads\//);

    // Same id, different tenant: the service scopes by sellerId → 404.
    await page.context().clearCookies();
    await login(page, "owner@noida-lights.test");
    const response = await page.goto(`${APEX}${href}`);
    expect(response?.status()).toBe(404);
  });
});
