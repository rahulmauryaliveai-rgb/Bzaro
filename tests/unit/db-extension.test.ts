import { describe, expect, it } from "vitest";

/**
 * Does the retry extension actually get invoked?
 *
 * The classification logic is covered by `db-retry.test.ts`, but logic that is
 * never called protects nothing. This checks the WIRING: that Prisma's client
 * extension hooks fire for both model reads and raw queries, which is what the
 * retry in `db.ts` depends on.
 *
 * Prisma's extension API supports model operations under `$allModels`. Whether
 * top-level raw operations (`$queryRaw`) are also interceptable is the part
 * worth pinning down — the marketplace's search and facet queries are raw SQL
 * and are exactly the reads that must survive a recycled connection.
 *
 * No database is contacted: every query fails at connection time, which is all
 * that is needed to observe whether the hook ran.
 */

describe("Prisma client extension hooks", () => {
  it("fires for model reads and for raw queries", async () => {
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const { Pool } = await import("pg");
    const { PrismaClient } = await import("@/generated/prisma/client");

    // A port nothing is listening on: every query fails fast.
    const pool = new Pool({
      connectionString: "postgres://postgres:postgres@127.0.0.1:1/none",
      connectionTimeoutMillis: 500,
    });
    pool.on("error", () => {
      /* expected: nothing is listening */
    });

    let modelHook = 0;
    let rawHook = 0;

    const client = new PrismaClient({ adapter: new PrismaPg(pool) }).$extends({
      name: "probe",
      query: {
        $allModels: {
          async $allOperations({ args, query }) {
            modelHook += 1;
            return query(args);
          },
        },
        async $queryRaw({ args, query }) {
          rawHook += 1;
          return query(args);
        },
      },
    });

    await client.seller.count().catch(() => undefined);
    await client.$queryRaw`SELECT 1`.catch(() => undefined);

    await pool.end().catch(() => undefined);

    expect(modelHook, "model operations must be interceptable").toBe(1);
    expect(rawHook, "raw queries must be interceptable, or search cannot retry").toBe(1);
  }, 20_000);
});
