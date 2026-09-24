import { expect, test, type Locator } from "@playwright/test";

/**
 * Buyer contact flow (docs/LEADS.md §1), as it works since D35:
 *
 *   click "Get Best Price" → requirement → (create account) → wa.me link
 *
 * The requirement comes FIRST and the account is asked for at "Send", so the
 * cost of signing up lands after the buyer has already decided what they want.
 * The draft survives that step — losing it would be the whole reason the modal
 * exists rather than a redirect to /register.
 *
 * Runs against a server started with OTP_TEST_CODE (src/env.ts), which pins the
 * emailed signup code as well as the seller's phone code. Everything else is
 * the real stack: real rate limiter, real EmailOtp rows, real User /
 * Requirement / Lead inserts, and the console mail provider.
 */

const PORT = Number(process.env.PORT ?? 3000);
const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? `lvh.me:${PORT}`;
const APEX = `http://${ROOT}`;
const CODE = process.env.OTP_TEST_CODE ?? "123456";

/** Fresh identity per run, so rate limits and the 7-day dedupe never bleed. */
function freshIdentity() {
  const suffix = String(Date.now() % 1_000_000).padStart(6, "0");
  return {
    email: `buyer.${Date.now().toString(36)}@example.test`,
    phone: `+9198${suffix.slice(0, 2)}${suffix}`,
  };
}

async function fillRequirement(dialog: Locator) {
  await dialog.getByLabel("What do you need?").fill("LED panel light 40W");
  await dialog.getByLabel("Quantity").fill("250");
  await dialog.getByLabel("Your city").selectOption({ label: "Mumbai" });
  await dialog.getByLabel("Your name (optional)").fill("Test Buyer");
}

test.describe("buyer contact flow", () => {
  test("nothing is asked on page load", async ({ page }) => {
    await page.goto(`${APEX}/seller/abc-electronics`);
    await expect(page.getByRole("button", { name: "Get Best Price" })).toBeVisible();
    // No modal, and certainly no signup form, until the buyer asks for one.
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("the requirement form comes first, before any account", async ({ page }) => {
    await page.goto(`${APEX}/seller/abc-electronics`);
    await page.getByRole("button", { name: "Get Best Price" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Straight to the requirement — a signed-out buyer is not gated here.
    await expect(dialog.getByLabel("What do you need?")).toBeVisible();
    await expect(dialog.getByLabel("Email")).toBeHidden();
  });

  test("the consent notice is shown above Submit and names the Privacy Policy", async ({
    page,
  }) => {
    await page.goto(`${APEX}/seller/abc-electronics`);
    await page.getByRole("button", { name: "Get Best Price" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/shared with verified sellers/i)).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Privacy Policy" })).toBeVisible();
  });

  test("sending signed out asks for an account, then auto-sends the saved draft", async ({
    page,
  }) => {
    const { email, phone } = freshIdentity();

    await page.goto(`${APEX}/seller/abc-electronics`);
    await page.getByRole("button", { name: "Get Best Price" }).click();

    const dialog = page.getByRole("dialog");
    await fillRequirement(dialog);
    await dialog.getByRole("button", { name: /Send/ }).click();

    // Step 2: the account, asked for only now.
    await expect(dialog.getByText("Create an account to send")).toBeVisible();
    await dialog.getByLabel("Your name").fill("Test Buyer");
    await dialog.getByLabel("Email").fill(email);
    await dialog.getByLabel("Mobile number").fill(phone);
    await dialog.getByLabel("Password").fill("a-long-enough-password");
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Create account" }).click();

    // Step 3: the emailed code.
    await expect(dialog.getByText(/sent a 6-digit code/i)).toBeVisible();
    await dialog.getByLabel("6-digit code").fill(CODE);
    await dialog.getByRole("button", { name: "Verify" }).click();

    // The draft is resubmitted for them: the requirement they typed BEFORE
    // signing up is what gets sent.
    const link = dialog.getByRole("link", { name: "Continue on WhatsApp" });
    await expect(link).toBeVisible({ timeout: 15_000 });

    const href = await link.getAttribute("href");
    expect(href).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
    const text = decodeURIComponent(href!.split("text=")[1]!);
    expect(text).toContain("LED panel light 40W");
    expect(text).toContain("250 pieces");
    expect(text).toContain("Mumbai");
  });

  test("a wrong signup code counts down and eventually locks", async ({ page }) => {
    const { email, phone } = freshIdentity();
    const wrong = CODE === "000000" ? "000001" : "000000";

    await page.goto(`${APEX}/seller/abc-electronics`);
    await page.getByRole("button", { name: "Get Best Price" }).click();

    const dialog = page.getByRole("dialog");
    await fillRequirement(dialog);
    await dialog.getByRole("button", { name: /Send/ }).click();

    await dialog.getByLabel("Your name").fill("Test Buyer");
    await dialog.getByLabel("Email").fill(email);
    await dialog.getByLabel("Mobile number").fill(phone);
    await dialog.getByLabel("Password").fill("a-long-enough-password");
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Create account" }).click();

    await expect(dialog.getByText(/sent a 6-digit code/i)).toBeVisible();

    // Five attempts on an email code, not three — see EMAIL_OTP_MAX_ATTEMPTS.
    for (const remaining of [4, 3, 2, 1]) {
      await dialog.getByLabel("6-digit code").fill(wrong);
      await dialog.getByRole("button", { name: "Verify" }).click();
      await expect(
        dialog.getByText(`${remaining} attempt${remaining === 1 ? "" : "s"} left`),
      ).toBeVisible();
    }

    await dialog.getByLabel("6-digit code").fill(wrong);
    await dialog.getByRole("button", { name: "Verify" }).click();
    await expect(dialog.getByText(/Too many wrong attempts/i)).toBeVisible();
  });
});
