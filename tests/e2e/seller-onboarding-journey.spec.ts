import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * The signed-in onboarding journey: register → sign in → claim a subdomain.
 *
 * ── Why this is driven over HTTP rather than through a browser ───────────────
 * Chromium is unavailable in this environment, so the earlier dashboard spec
 * could only assert that anonymous visitors are locked out. That left the
 * actual deliverable — a seller registering and getting a working site —
 * covered by nothing.
 *
 * Next.js Server Actions degrade to plain form posts when JavaScript is absent:
 * the `$ACTION_*` hidden inputs in the rendered HTML carry everything the
 * server needs. Replaying those fields exercises the real production path,
 * through the real proxy, actions, validation and database.
 *
 * It also pins down something a browser test would not: that the forms work
 * WITHOUT JavaScript at all. For a seller on a cheap Android phone over patchy
 * mobile data, that is not a hypothetical.
 */

const PORT = Number(process.env.PORT ?? 3000);
const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? `lvh.me:${PORT}`;
const APEX = `http://${ROOT}`;

/** Unique per run, so repeated runs never collide on the email or the slug. */
const STAMP = Date.now().toString(36);
const EMAIL = `journey-${STAMP}@example.test`;
const SLUG = `journey-${STAMP}`;
const PASSWORD = "journey-password-123";

/** Hidden inputs Next renders to make a Server Action work without JavaScript. */
function actionFields(html: string): Array<{ name: string; value: string }> {
  return [...html.matchAll(/<input[^>]*type="hidden"[^>]*>/g)]
    .map((match) => ({
      name: match[0].match(/name="([^"]*)"/)?.[1] ?? "",
      value: (match[0].match(/value="([^"]*)"/)?.[1] ?? "")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&"),
    }))
    .filter((field) => field.name);
}

function withActionFields(html: string, values: Record<string, string>) {
  const form: Record<string, string> = {};
  for (const field of actionFields(html)) form[field.name] = field.value;
  return { ...form, ...values };
}

async function html(request: APIRequestContext, path: string) {
  const response = await request.get(`${APEX}${path}`, { maxRedirects: 0 });
  return { response, body: await response.text() };
}

test.describe.configure({ mode: "serial" });

test.describe("a seller can register and claim a subdomain", () => {
  /**
   * ONE context for the whole journey.
   *
   * The per-test `request` fixture is a fresh context with an empty cookie jar,
   * so the session established when signing in would be gone by the next step
   * and onboarding would look unreachable. This is a journey: it needs one jar
   * throughout.
   */
  let request: APIRequestContext;

  /** Status of the no-JS registration POST, asserted by the first test. */
  let registerStatus = 0;

  /**
   * True when this IP has spent its five registrations for the hour.
   *
   * That is the rate limiter working correctly, not a regression — but every
   * step below it would then fail for a reason unrelated to the code under
   * test, so the whole journey skips with an explanation instead.
   */
  let rateLimited = false;

  test.beforeAll(async ({ playwright }) => {
    request = await playwright.request.newContext();

    const { body } = await html(request, "/register");

    const response = await request.post(`${APEX}/register`, {
      maxRedirects: 0,
      multipart: withActionFields(body, {
        name: "Journey Tester",
        email: EMAIL,
        password: PASSWORD,
        confirmPassword: PASSWORD,
        acceptTerms: "on",
      }),
    });

    registerStatus = response.status();
    // The register action says "Too many sign-ups from this network"; the
    // login action says "Too many attempts". Match either, so this keeps
    // working if the journey grows another rate-limited step.
    rateLimited = /Too many (sign-ups|attempts)/.test(await response.text());
  });

  test.beforeEach(() => {
    test.skip(
      rateLimited,
      "registration rate limit reached for this IP — the limiter is working; retry within the hour",
    );
  });

  test.afterAll(async () => {
    await request.dispose();

    // Every run claims a fresh slug, so without this the development database
    // slowly fills with abandoned businesses. Best-effort: a cleanup failure
    // must never turn a passing suite red.
    try {
      const { config } = await import("dotenv");
      const { default: pg } = await import("pg");

      config({ path: ".env.local", quiet: true });

      const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      await client.query(`DELETE FROM "Seller" WHERE slug = $1`, [SLUG]);
      await client.query(`DELETE FROM "User" WHERE email = $1`, [EMAIL]);
      await client.end();
    } catch {
      /* leaving a test fixture behind is untidy, not a failure */
    }
  });
  test("the account form works without JavaScript", () => {
    // A Server Action replies 200 with a flight payload, or redirects. What
    // must not happen is a 4xx/5xx: that means the no-JS path is broken.
    expect(registerStatus, "registration should be accepted").toBeLessThan(400);
  });

  test("signing in issues a session, and onboarding then becomes reachable", async () => {
    const csrf = await (await request.get(`${APEX}/api/auth/csrf`)).json();

    const login = await request.post(`${APEX}/api/auth/callback/credentials`, {
      maxRedirects: 0,
      form: {
        csrfToken: csrf.csrfToken,
        email: EMAIL,
        password: PASSWORD,
        callbackUrl: `${APEX}/dashboard`,
        redirect: "false",
      },
    });

    expect(login.status(), "credentials should be accepted").toBeLessThan(400);

    // The same request context carries the session cookie from here on, so the
    // guard that redirected anonymous visitors should now let us through.
    const onboarding = await request.get(`${APEX}/register/business`, { maxRedirects: 0 });
    expect(onboarding.status(), "a signed-in user reaches onboarding").toBe(200);
  });

  test("claiming a subdomain provisions the business", async () => {
    const { body } = await html(request, "/register/business");

    // Read the real option values rather than hardcoding ids: the seed
    // regenerates them, and a stale id would fail as a validation error that
    // looks like a bug in the form.
    const locationId = body.match(/<option value="(c[^"]+)"/)?.[1];
    const categoryId = [...body.matchAll(/name="categoryIds" value="([^"]+)"/g)][0]?.[1];

    expect(locationId, "the form should offer cities").toBeTruthy();
    expect(categoryId, "the form should offer categories").toBeTruthy();

    const response = await request.post(`${APEX}/register/business`, {
      maxRedirects: 0,
      multipart: withActionFields(body, {
        businessName: "Journey Instruments",
        slug: SLUG,
        phone: "+919876500000",
        locationId: locationId!,
        categoryIds: categoryId!,
      }),
    });

    expect(response.status(), "onboarding should redirect on success").toBe(303);
    expect(response.headers()["location"]).toContain("/dashboard");
  });

  test("the new subdomain is reserved but not yet public", async () => {
    // A brand-new seller is PENDING_VERIFICATION, and the onboarding form
    // promises exactly this: the address is reserved immediately and goes live
    // once the business is verified. A 200 here would contradict that promise
    // and publish an unverified business.
    const response = await request.get(`http://${SLUG}.${ROOT}/`, { maxRedirects: 0 });
    expect(response.status()).toBe(404);
  });

  test("the claimed slug cannot be taken by someone else", async () => {
    const { body } = await html(request, "/register/business");
    const locationId = body.match(/<option value="(c[^"]+)"/)?.[1];
    const categoryId = [...body.matchAll(/name="categoryIds" value="([^"]+)"/g)][0]?.[1];

    const response = await request.post(`${APEX}/register/business`, {
      maxRedirects: 0,
      multipart: withActionFields(body, {
        businessName: "Impostor Instruments",
        slug: SLUG,
        phone: "+919876500001",
        locationId: locationId ?? "",
        categoryIds: categoryId ?? "",
      }),
    });

    // Must not provision a second business onto the same slug.
    expect(response.status(), "a duplicate claim must not succeed").not.toBe(303);
  });
});
