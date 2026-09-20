import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * Gallery CRUD, driven over HTTP through the no-JavaScript form path.
 *
 * Running against a production build matters here for a second reason beyond
 * realism: Server Action ids are stable in a production build and are rebuilt
 * on every recompile in development, so replaying a form is only reliable here.
 *
 * The reorder cases are the ones worth the most. Order is what sellers actually
 * change about a gallery — the first images are what a buyer sees — and a swap
 * that silently does nothing is the kind of bug a seller reports as "it keeps
 * forgetting what I did".
 */

const PORT = Number(process.env.PORT ?? 3000);
const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? `lvh.me:${PORT}`;
const APEX = `http://${ROOT}`;
const PASSWORD = "devpassword123";

const STAMP = Date.now().toString(36);

/** Hidden `$ACTION_*` fields of the single form containing `marker`. */
function actionFields(html: string, marker: string): Record<string, string> {
  for (const form of html.matchAll(/<form[\s\S]*?<\/form>/g)) {
    if (!form[0].includes(marker)) continue;

    const fields: Record<string, string> = {};
    for (const input of form[0].matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
      const name = input[0].match(/name="([^"]*)"/)?.[1];
      if (!name?.startsWith("$ACTION")) continue;
      fields[name] = (input[0].match(/value="([^"]*)"/)?.[1] ?? "")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&");
    }
    return fields;
  }
  return {};
}

/**
 * Sign in, and report whether a usable session actually resulted.
 *
 * Auth.js answers 302 whether the credentials were accepted or not, so the
 * status alone proves nothing. The login limiter allows ten attempts per hour
 * per IP — running this suite repeatedly trips it legitimately — and without
 * this check that shows up much later as an unexplained 307 on a dashboard
 * page, which reads like a broken guard rather than a working limiter.
 */
async function signIn(request: APIRequestContext, email: string): Promise<boolean> {
  const csrf = await (await request.get(`${APEX}/api/auth/csrf`)).json();

  await request.post(`${APEX}/api/auth/callback/credentials`, {
    maxRedirects: 0,
    form: {
      csrfToken: csrf.csrfToken,
      email,
      password: PASSWORD,
      callbackUrl: `${APEX}/dashboard`,
      redirect: "false",
    },
  });

  const dashboard = await request.get(`${APEX}/dashboard`, { maxRedirects: 0 });
  return dashboard.status() === 200;
}

async function galleryPage(request: APIRequestContext) {
  const response = await request.get(`${APEX}/dashboard/gallery`, { maxRedirects: 0 });
  return { status: response.status(), html: await response.text() };
}

/** How many images the page reports, from its "N of 60" counter. */
function count(html: string): number {
  const plain = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  return Number(plain.match(/(\d+) of 60/)?.[1] ?? -1);
}

/** Item ids in their current display order. */
function orderedIds(html: string): string[] {
  return [...new Set([...html.matchAll(/name="id" value="(c[a-z0-9]+)"/g)].map((m) => m[1]))];
}

test.describe.configure({ mode: "serial" });

test.describe("a seller manages their gallery", () => {
  let owner: APIRequestContext;
  let other: APIRequestContext;

  /** False when the login limiter refused us; the whole journey then skips. */
  let signedIn = false;

  test.beforeAll(async ({ playwright }) => {
    owner = await playwright.request.newContext();
    other = await playwright.request.newContext();

    const ownerIn = await signIn(owner, "owner@abc-electronics.test");
    const otherIn = await signIn(other, "owner@sharma-steel.test");

    signedIn = ownerIn && otherIn;
  });

  test.beforeEach(() => {
    test.skip(
      !signedIn,
      "could not sign in — the login rate limit is working; retry within the hour",
    );
  });

  test.afterAll(async () => {
    try {
      const { config } = await import("dotenv");
      const { default: pg } = await import("pg");

      config({ path: ".env.local", quiet: true });

      const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      await client.query(`DELETE FROM "GalleryItem" WHERE url LIKE $1`, [`%e2e-${STAMP}%`]);
      await client.end();
    } catch {
      /* a leftover fixture is untidy, not a failure */
    }

    await owner.dispose();
    await other.dispose();
  });

  test("adding images works without JavaScript", async () => {
    const before = await galleryPage(owner);
    expect(before.status).toBe(200);

    const startingCount = count(before.html);

    // A real FormData, because the form posts PARALLEL ARRAYS: each row
    // contributes one entry to every field, and the server pairs them by index.
    // Playwright's `multipart` option takes a flat record and cannot express a
    // repeated field.
    const body = new FormData();

    for (const [name, value] of Object.entries(actionFields(before.html, 'name="imageUrl"'))) {
      body.append(name, value);
    }

    const rows = [
      {
        url: `https://picsum.photos/seed/e2e-${STAMP}-a/800/600`,
        title: "Workshop",
        alt: "Our workshop floor",
      },
      // Deliberately no alt text, so the next test has something to report.
      { url: `https://picsum.photos/seed/e2e-${STAMP}-b/800/600`, title: "Team", alt: "" },
    ];

    for (const row of rows) {
      body.append("imagePublicId", "");
      body.append("imageProvider", "");
      body.append("imageWidth", "");
      body.append("imageHeight", "");
      body.append("imageUrl", row.url);
      body.append("imageTitle", row.title);
      body.append("imageCaption", "");
      body.append("imageAlt", row.alt);
    }

    const response = await owner.post(`${APEX}/dashboard/gallery`, {
      maxRedirects: 0,
      multipart: body,
    });

    expect(response.status(), "the no-JS add should be accepted").toBeLessThan(400);

    const after = await galleryPage(owner);
    expect(count(after.html), "two images should have been added").toBe(startingCount + 2);
  });

  test("an image with no description is reported, not silently accepted", async () => {
    // One of the two above deliberately has no alt text. Without a description
    // a photograph is invisible to a screen reader and carries nothing for
    // search engines, so the page has to say so.
    const { html } = await galleryPage(owner);
    const plain = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

    // Matched loosely on purpose. React renders the count and the pluralised
    // word as separate text nodes, so stripping tags here yields "2 image s
    // have" even though a browser shows "2 images have". Asserting the exact
    // sentence would be testing this helper's whitespace handling, not the app.
    expect(plain).toContain("no description");
    expect(plain).toMatch(/\d+\s+image/);
  });

  test("a protocol-relative URL is refused", async () => {
    // `//evil.example.com/x.jpg` starts with a slash but resolves to an
    // external host. Regression: an earlier check treated it as a local path.
    const before = await galleryPage(owner);
    const startingCount = count(before.html);

    await owner.post(`${APEX}/dashboard/gallery`, {
      maxRedirects: 0,
      multipart: {
        ...actionFields(before.html, 'name="imageUrl"'),
        imagePublicId: "",
        imageProvider: "",
        imageWidth: "",
        imageHeight: "",
        imageUrl: "//evil.example.com/x.jpg",
        imageTitle: "",
        imageCaption: "",
        imageAlt: "",
      },
    });

    const after = await galleryPage(owner);
    expect(count(after.html), "nothing should have been added").toBe(startingCount);
  });

  test("moving an image down swaps it with its neighbour", async () => {
    const before = await galleryPage(owner);
    const ids = orderedIds(before.html);

    expect(ids.length, "need at least two images to reorder").toBeGreaterThan(1);

    const response = await owner.post(`${APEX}/dashboard/gallery`, {
      maxRedirects: 0,
      multipart: {
        ...actionFields(before.html, 'value="down"'),
        id: ids[0],
        direction: "down",
      },
    });

    expect(response.status()).toBeLessThan(400);

    const after = orderedIds((await galleryPage(owner)).html);
    expect(after[1], "the first image should now be second").toBe(ids[0]);
    expect(after[0], "its neighbour should have moved up").toBe(ids[1]);
  });

  test("moving the first image up is a harmless no-op", async () => {
    const before = await galleryPage(owner);
    const ids = orderedIds(before.html);

    await owner.post(`${APEX}/dashboard/gallery`, {
      maxRedirects: 0,
      multipart: {
        ...actionFields(before.html, 'value="up"'),
        id: ids[0],
        direction: "up",
      },
    });

    // Pressing a button that had nothing to do is not an error, and must not
    // scramble the order either.
    const after = orderedIds((await galleryPage(owner)).html);
    expect(after).toEqual(ids);
  });

  test("deleting requires the confirmation tick", async () => {
    const before = await galleryPage(owner);
    const startingCount = count(before.html);
    const ids = orderedIds(before.html);

    await owner.post(`${APEX}/dashboard/gallery`, {
      maxRedirects: 0,
      multipart: {
        ...actionFields(before.html, 'name="confirm"'),
        id: ids[0],
      },
    });

    const after = await galleryPage(owner);
    expect(count(after.html), "nothing should have been removed").toBe(startingCount);
  });

  test("another seller cannot reorder or delete these images", async () => {
    const mine = await galleryPage(owner);
    const ids = orderedIds(mine.html);

    const theirs = await galleryPage(other);
    expect(theirs.status).toBe(200);

    // Borrow the other seller's own action fields and aim them at our ids.
    const fields = actionFields(theirs.html, 'name="imageUrl"');

    await other.post(`${APEX}/dashboard/gallery`, {
      maxRedirects: 0,
      multipart: { ...fields, id: ids[0], direction: "down" },
    });

    const afterCross = orderedIds((await galleryPage(owner)).html);
    expect(afterCross, "our order must be untouched").toEqual(ids);
  });
});

test.describe("the gallery manager is private", () => {
  test("does not render for an anonymous visitor", async ({ request }) => {
    const response = await request.get(`${APEX}/dashboard/gallery`, { maxRedirects: 0 });
    expect(response.status()).not.toBe(200);
  });

  test("is noindex and uncacheable", async ({ request }) => {
    const response = await request.get(`${APEX}/dashboard/gallery`, { maxRedirects: 0 });

    expect(response.headers()["x-robots-tag"]).toContain("noindex");
    expect(response.headers()["cache-control"]).toContain("no-store");
  });
});
