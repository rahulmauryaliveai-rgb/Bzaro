#!/usr/bin/env node
/**
 * Pre-flight for the D49 migration: would `UNIQUE (sellerId, sku)` fail?
 *
 * ── Why this is a script and not part of the migration ──────────────────────
 * The migration creates the unique index, so a seller who has used the same
 * product code on two products makes it abort. That is the correct failure —
 * the alternative is a migration that silently renames or deletes one of their
 * products — but "relation already exists"-style errors mid-deploy are a bad
 * way to find out. Run this first, on the database you are about to migrate:
 *
 *   DATABASE_URL=... node scripts/check-duplicate-skus.mjs
 *   npm run db:check:sku                      # local, reads .env.local
 *
 * It only ever READS. Nothing here renames, blanks or deletes a SKU: which of
 * two colliding products keeps the code is a decision for whoever owns the
 * catalogue, not for a migration script.
 *
 * Exit codes: 0 clean, 1 duplicates found (do not migrate), 2 could not check.
 */

import { config as loadEnv } from "dotenv";
import pg from "pg";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

if (!url) {
  console.error("No DATABASE_URL. Set it, or run inside the project with .env.local present.");
  process.exit(2);
}

const client = new pg.Client({ connectionString: url });

try {
  await client.connect();
} catch (error) {
  console.error(`Could not connect: ${error.message}`);
  process.exit(2);
}

try {
  /**
   * Grouped case-insensitively and with surrounding spaces ignored, because
   * that is what the CITEXT column will compare on after the migration —
   * checking case-sensitively here would miss exactly the rows that break it.
   */
  const { rows: duplicates } = await client.query(`
    SELECT s.slug                                        AS seller,
           lower(btrim(p.sku))                           AS code,
           count(*)::int                                 AS copies,
           array_agg(p.sku   ORDER BY p."createdAt")     AS skus,
           array_agg(p.name  ORDER BY p."createdAt")     AS names,
           array_agg(p.id    ORDER BY p."createdAt")     AS ids,
           array_agg(p."deletedAt" IS NOT NULL
                            ORDER BY p."createdAt")      AS deleted
      FROM "Product" p
      JOIN "Seller"  s ON s.id = p."sellerId"
     WHERE p.sku IS NOT NULL AND btrim(p.sku) <> ''
     GROUP BY s.slug, lower(btrim(p.sku))
    HAVING count(*) > 1
     ORDER BY s.slug, code
  `);

  /**
   * Reported but NOT fatal. The format rule is enforced on new input only, so
   * a product keeping a SKU with a space or a slash in it is deliberate — it
   * simply cannot be targeted by a photo file name until someone renames it.
   */
  const { rows: malformed } = await client.query(`
    SELECT s.slug AS seller, p.sku, p.name
      FROM "Product" p
      JOIN "Seller"  s ON s.id = p."sellerId"
     WHERE p.sku IS NOT NULL AND btrim(p.sku) <> ''
       AND (p.sku !~ '^[A-Za-z0-9-]+$' OR length(p.sku) > 60)
     ORDER BY s.slug, p.sku
  `);

  const { rows: totals } = await client.query(`
    SELECT count(*)::int AS products,
           count(p.sku)::int AS with_sku
      FROM "Product" p
  `);

  console.log(`Products: ${totals[0].products} (${totals[0].with_sku} carry a SKU)`);

  if (malformed.length > 0) {
    console.log(
      `\n${malformed.length} SKU(s) do not match the new format (A–Z, 0–9, hyphen, max 60).`,
    );
    console.log("These keep working. They cannot be matched by a photo file name until renamed:");
    for (const row of malformed) {
      console.log(`  ${row.seller}  ${JSON.stringify(row.sku)}  — ${row.name}`);
    }
  }

  if (duplicates.length === 0) {
    console.log("\nNo duplicate SKUs per seller. The D49 migration can run.");
    process.exit(0);
  }

  console.log(`\nSTOP — ${duplicates.length} duplicate SKU group(s). The migration WILL fail.`);
  console.log("Nothing has been changed. Decide which product keeps each code, then re-run.\n");

  for (const row of duplicates) {
    console.log(`Seller ${row.seller} — code ${JSON.stringify(row.code)} used ${row.copies}×`);
    for (let index = 0; index < row.ids.length; index += 1) {
      const suffix = row.deleted[index] ? "  [deleted]" : "";
      console.log(`    ${row.ids[index]}  ${JSON.stringify(row.skus[index])}  ${row.names[index]}${suffix}`);
    }
  }

  process.exit(1);
} finally {
  await client.end().catch(() => undefined);
}
