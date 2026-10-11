import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";

/**
 * The 12-photo cap under concurrent attaches (D49).
 *
 * ── Why this cannot be a unit test ─────────────────────────────────────────
 * `attachPhotoAction` counts a product's photos and inserts one more. Whether
 * that pair is safe is not a property of our code — it is a property of the
 * database's isolation level, and nothing mocked can observe it.
 *
 * The bug this pins: wrapping count-and-insert in a transaction LOOKS
 * sufficient and is not. Under READ COMMITTED, Postgres' default, two
 * transactions each run the COUNT and each see the same number. Neither blocks
 * the other, because the rows they are about to insert do not exist yet and
 * there is nothing for them to contend on. Both insert, and the product goes
 * over the cap.
 *
 * `SELECT ... FOR UPDATE` on the parent Product row gives them something to
 * contend on: attaches for one product serialise, attaches for different
 * products stay parallel.
 *
 * ── Interleaved by hand, not by the scheduler ──────────────────────────────
 * The first version of this fired four attaches at once and hoped they would
 * overlap. A test that needs a race to happen by luck is a test that will one
 * day stop finding the bug. The statement order is therefore explicit: both
 * transactions COUNT before either INSERTs, which is exactly the window READ
 * COMMITTED leaves open.
 *
 * ── Requires a real Postgres, and says so ──────────────────────────────────
 * The development database is PGlite — Postgres compiled to WASM (D24) — and
 * it serialises work across connections: while one connection holds an open
 * transaction, a second cannot run even `SELECT 2`. A blocking-lock test is
 * therefore not slow there, it is impossible; it deadlocks the engine against
 * itself. These tests skip on WASM rather than hanging, and run against a real
 * server:
 *
 *   INTEGRATION_DATABASE_URL=postgres://… npx vitest run tests/integration
 *
 * CI's tenant-isolation job has a postgres:16 service and passes that variable,
 * so this is executed on every push and pull request.
 *
 * A dedicated variable, not DATABASE_URL, because `vitest.config.ts` stubs
 * DATABASE_URL with an obvious fake so modules that read validated env can be
 * imported. That stub would otherwise win here.
 */

const MAX_PHOTOS = 12;

/** Marks every row this file creates, so cleanup cannot touch anything else. */
const STAMP = `caplock-${Date.now().toString(36)}`;

/** Seeding eleven rows plus a deliberate lock wait is past vitest's 5s default. */
const TEST_TIMEOUT_MS = 60_000;

/** How long a blocked statement is given to prove it is blocked. */
const LOCK_WAIT_MS = 400;

/**
 * Decided synchronously, at collection time, so the suite is reported as
 * SKIPPED rather than as four passing tests that did nothing.
 *
 * That distinction matters more than it looks: a `return` early inside the
 * test body shows up as green, and vitest does not surface `console.warn` in
 * its default reporter — so a developer would read "4 passed" and believe the
 * locking was verified when nothing had run at all.
 *
 * If the variable IS set, the suite runs and a PGlite URL throws loudly in
 * `beforeAll` rather than skipping: someone who sets this intends a real
 * server, and pointing it at the WASM database is a mistake worth hearing
 * about.
 */
const DATABASE_URL = process.env.INTEGRATION_DATABASE_URL ?? "";
const UNAVAILABLE = DATABASE_URL === "";

let admin: Client | null = null;
let other: Client | null = null;
let sellerId = "";

async function connect(url: string): Promise<Client> {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return client;
}

beforeAll(async () => {
  admin = await connect(DATABASE_URL);

  // Caught here rather than skipped: see the note on UNAVAILABLE.
  const version: string = (await admin.query("SELECT version()")).rows[0].version;
  if (/wasm/i.test(version)) {
    throw new Error(
      "INTEGRATION_DATABASE_URL points at PGlite (WASM), which serialises connections " +
        "and cannot run a blocking-lock test — it would deadlock against itself. " +
        "Point it at a real Postgres, or unset it to skip this suite.",
    );
  }

  other = await connect(DATABASE_URL);

  sellerId = `${STAMP}-seller`;
  await admin.query(
    `INSERT INTO "Seller" ("id", "slug", "businessName", "updatedAt")
     VALUES ($1, $2, $3, now())`,
    [sellerId, sellerId, "Cap Lock Test Seller"],
  );
}, TEST_TIMEOUT_MS);

afterAll(async () => {
  if (admin) {
    await admin
      .query(`DELETE FROM "ProductImage" WHERE "sellerId" = $1`, [sellerId])
      .catch(() => undefined);
    await admin
      .query(`DELETE FROM "Product" WHERE "sellerId" = $1`, [sellerId])
      .catch(() => undefined);
    await admin.query(`DELETE FROM "Seller" WHERE "id" = $1`, [sellerId]).catch(() => undefined);
  }

  await other?.end().catch(() => undefined);
  await admin?.end().catch(() => undefined);
  admin = null;
  other = null;
}, TEST_TIMEOUT_MS);

/**
 * A product sitting one photo below the cap.
 *
 * Starting near the limit is what makes the overshoot a single extra row
 * rather than needing a dozen connections — and it is the realistic case: a
 * product near its limit while the three-at-a-time uploader attaches to it.
 */
async function productNearCap(label: string): Promise<string> {
  const id = `${STAMP}-${label}`;

  await admin!.query(
    `INSERT INTO "Product" ("id", "sellerId", "slug", "name", "updatedAt")
     VALUES ($1, $2, $3, $4, now())`,
    [id, sellerId, id, `Cap Lock ${label}`],
  );

  for (let index = 0; index < MAX_PHOTOS - 1; index += 1) {
    await insertImage(admin!, id, index);
  }

  return id;
}

// ── The statements `attachPhotoAction` runs, issued one at a time ───────────

function lockProduct(client: Client, productId: string) {
  return client.query(
    `SELECT "moderationStatus" FROM "Product"
      WHERE "id" = $1 AND "sellerId" = $2 AND "deletedAt" IS NULL
      FOR UPDATE`,
    [productId, sellerId],
  );
}

async function countImages(client: Client, productId: string): Promise<number> {
  const result = await client.query(
    `SELECT count(*)::int AS n FROM "ProductImage" WHERE "productId" = $1 AND "sellerId" = $2`,
    [productId, sellerId],
  );
  return result.rows[0].n;
}

function insertImage(client: Client, productId: string, index: number) {
  return client.query(
    `INSERT INTO "ProductImage" ("id", "productId", "sellerId", "publicId", "url", "sortOrder")
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      `${productId}-img-${index}`,
      productId,
      sellerId,
      `pub-${index}`,
      `https://example.test/${index}.jpg`,
      index,
    ],
  );
}

async function totalImages(productId: string): Promise<number> {
  return countImages(admin!, productId);
}

/**
 * Whether a pending statement is still waiting on a lock.
 *
 * The only way to assert "this blocked" is to observe that it has not finished
 * while something else holds the lock. Raced against a timer rather than slept
 * on, so a statement that acquires immediately is reported at once instead of
 * after a fixed delay.
 */
function settledWithin<T>(pending: Promise<T>, ms: number): Promise<"acquired" | "blocked"> {
  return Promise.race([
    pending.then(() => "acquired" as const),
    new Promise<"blocked">((resolve) => setTimeout(() => resolve("blocked"), ms)),
  ]);
}

describe.skipIf(UNAVAILABLE)("the 12-photo cap under concurrent attaches", () => {
  it(
    "confirms READ COMMITTED, which is what makes the race possible",
    async () => {
      // If this ever became SERIALIZABLE the unlocked case would fail with a
      // serialisation error instead of over-inserting, and the reasoning above
      // would need revisiting rather than silently still passing.
      const result = await admin!.query("SHOW transaction_isolation");
      expect(result.rows[0].transaction_isolation).toBe("read committed");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "WITHOUT the row lock, a transaction alone lets the cap be exceeded",
    async () => {
      const productId = await productNearCap("unlocked");
      const [a, b] = [admin!, other!];

      await a.query("BEGIN");
      await b.query("BEGIN");

      // Both see 11, so both conclude there is room for one more.
      expect(await countImages(a, productId)).toBe(MAX_PHOTOS - 1);
      expect(await countImages(b, productId)).toBe(MAX_PHOTOS - 1);

      await insertImage(a, productId, 101);
      await a.query("COMMIT");

      await insertImage(b, productId, 102);
      await b.query("COMMIT");

      // 13. The transaction was never a mutex — this is the assertion that
      // gives the locked test below its meaning.
      expect(
        await totalImages(productId),
        "if this is 12 the race no longer reproduces, and the locked test proves nothing",
      ).toBeGreaterThan(MAX_PHOTOS);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "WITH the row lock, the second transaction blocks and then refuses",
    async () => {
      const productId = await productNearCap("locked");
      const [a, b] = [admin!, other!];

      await a.query("BEGIN");
      await lockProduct(a, productId);

      await b.query("BEGIN");
      // Deliberately NOT awaited: this is the statement that has to block.
      const bWaiting = lockProduct(b, productId);

      expect(
        await settledWithin(bWaiting, LOCK_WAIT_MS),
        "the second attach must wait for the first, or its count races the insert",
      ).toBe("blocked");

      // The first attach takes the last slot while holding the lock.
      expect(await countImages(a, productId)).toBe(MAX_PHOTOS - 1);
      await insertImage(a, productId, 201);
      await a.query("COMMIT");

      // Released, so the second now acquires — and counts the committed insert
      // rather than the stale 11 it would have seen without the lock.
      await bWaiting;
      expect(await countImages(b, productId)).toBe(MAX_PHOTOS);

      // At the cap, so it refuses and writes nothing.
      await b.query("ROLLBACK");

      expect(await totalImages(productId)).toBe(MAX_PHOTOS);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "does not make attaches to DIFFERENT products wait for each other",
    async () => {
      // The lock is on one product row. Two products must stay independent, or
      // a large photo batch would crawl with every attach queueing behind an
      // unrelated one, and three-at-a-time uploading would be pointless.
      const first = await productNearCap("parallel-a");
      const second = await productNearCap("parallel-b");

      const [a, b] = [admin!, other!];

      await a.query("BEGIN");
      await lockProduct(a, first);

      await b.query("BEGIN");
      const bWaiting = lockProduct(b, second);

      expect(
        await settledWithin(bWaiting, LOCK_WAIT_MS),
        "a lock on one product must not block another product",
      ).toBe("acquired");

      await insertImage(a, first, 301);
      await insertImage(b, second, 302);
      await a.query("COMMIT");
      await b.query("COMMIT");

      expect(await totalImages(first)).toBe(MAX_PHOTOS);
      expect(await totalImages(second)).toBe(MAX_PHOTOS);
    },
    TEST_TIMEOUT_MS,
  );
});
