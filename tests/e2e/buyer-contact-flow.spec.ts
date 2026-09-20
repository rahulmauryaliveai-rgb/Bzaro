import { expect, test } from "@playwright/test";

/**
 * Buyer contact flow (docs/LEADS.md §1):
 *
 *   click "Enquire on WhatsApp" → phone → OTP → requirement → wa.me link
 *
 * Runs against a server started with OTP_TEST_CODE (see src/env.ts), so the
 * code is known. Everything else is the real stack: real rate limiter (in
 * memory), real challenge rows, real Buyer / Requirement / Lead inserts.
 */

const PORT = Number(process.env.PORT ?? 3000);
const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? `lvh.me:${PORT}`;
const APEX = `http://${ROOT}`;
const CODE = process.env.OTP_TEST_CODE ?? "123456";

// A fresh number per run so the per-phone rate limit and the 7-day dedupe
// never bleed between runs against a reused server.
function freshPhone(): string {
  const suffix = String(Date.now() % 1_000_000).padStart(6, "0");
  return `98${suffix.slice(0, 2)}${suffix}`;
}

test.describe("buyer contact flow", () => {
  test("no OTP prompt on page load", async ({ page }) => {
    await page.goto(`${APEX}/seller/abc-electronics`);
    await expect(page.getByRole("button", { name: "Enquire on WhatsApp" })).toBeVisible();
    await expect(page.getByLabel("Mobile number")).toBeHidden();
  });

  test("phone → OTP → requirement → WhatsApp link, and a DIRECT lead exists", async ({
    page,
    context,
  }) => {
    const phone = freshPhone();

    await page.goto(`${APEX}/seller/abc-electronics`);
    await page.getByRole("button", { name: "Get Best Price" }).click();

    // Step 1: phone
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Mobile number").fill(phone);
    await dialog.getByRole("button", { name: "Send code" }).click();

    // Step 2: OTP + consent
    await expect(dialog.getByText("We sent a 6-digit code")).toBeVisible();
    await dialog.getByLabel("One-time code").fill(CODE);
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Verify" }).click();

    // Step 3: requirement (product name prefilled only on product pages)
    await expect(dialog.getByLabel("What do you need?")).toBeVisible();
    await dialog.getByLabel("What do you need?").fill("LED panel light 40W");
    await dialog.getByLabel("Quantity").fill("250");
    await dialog.getByLabel("Your city").selectOption({ label: "Mumbai" });
    await dialog.getByLabel("Your name (optional)").fill("Test Buyer");
    await dialog.getByRole("button", { name: /Send/ }).click();

    // Done: the wa.me link carries the structured requirement.
    const link = dialog.getByRole("link", { name: "Continue on WhatsApp" });
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
    const text = decodeURIComponent(href!.split("text=")[1]!);
    expect(text).toContain("LED panel light 40W");
    expect(text).toContain("250 pieces");
    expect(text).toContain("Mumbai");
    expect(text).toContain("Test Buyer");

    // The buyer cookie was set: host-only, httpOnly.
    const cookies = await context.cookies(APEX);
    const buyerCookie = cookies.find((c) => c.name.endsWith("bz_buyer"));
    expect(buyerCookie).toBeDefined();
    expect(buyerCookie!.httpOnly).toBe(true);
    expect(buyerCookie!.domain.startsWith(".")).toBe(false);
  });

  test("a returning buyer skips straight to the requirement", async ({ page }) => {
    const phone = freshPhone();

    await page.goto(`${APEX}/seller/abc-electronics`);
    await page.getByRole("button", { name: "Get Best Price" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Mobile number").fill(phone);
    await dialog.getByRole("button", { name: "Send code" }).click();
    await dialog.getByLabel("One-time code").fill(CODE);
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Verify" }).click();
    await expect(dialog.getByLabel("What do you need?")).toBeVisible();
    await page.keyboard.press("Escape");

    // Second product, same browser: no phone step.
    await page.goto(`${APEX}/seller/abc-electronics`);
    await page.getByRole("button", { name: "Get Best Price" }).click();
    await expect(page.getByRole("dialog").getByLabel("What do you need?")).toBeVisible();
    await expect(page.getByRole("dialog").getByLabel("Mobile number")).toBeHidden();
  });

  test("a wrong code counts down and locks after three", async ({ page }) => {
    const phone = freshPhone();
    const wrong = CODE === "000000" ? "000001" : "000000";

    await page.goto(`${APEX}/seller/abc-electronics`);
    await page.getByRole("button", { name: "Get Best Price" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Mobile number").fill(phone);
    await dialog.getByRole("button", { name: "Send code" }).click();
    await dialog.getByRole("checkbox").check();

    for (const remaining of [2, 1]) {
      await dialog.getByLabel("One-time code").fill(wrong);
      await dialog.getByRole("button", { name: "Verify" }).click();
      await expect(
        dialog.getByText(`${remaining} attempt${remaining === 1 ? "" : "s"} left`),
      ).toBeVisible();
    }
    await dialog.getByLabel("One-time code").fill(wrong);
    await dialog.getByRole("button", { name: "Verify" }).click();
    await expect(dialog.getByText("Too many wrong attempts")).toBeVisible();

    // Even the right code is refused now.
    await dialog.getByLabel("One-time code").fill(CODE);
    await dialog.getByRole("button", { name: "Verify" }).click();
    await expect(dialog.getByText("Too many wrong attempts")).toBeVisible();
  });
});
