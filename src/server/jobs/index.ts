import "server-only";
import { db } from "@/lib/db";
import { recomputeIndexability } from "@/server/services/indexability.service";
import { pruneExpiredTokens } from "@/lib/tokens";

/**
 * Scheduled jobs.
 *
 * Plain async functions, not route handlers. They are invoked by
 * `/api/cron/[job]` today, but keeping the logic here means they are equally
 * callable from a queue worker, a script, or a test — which matters if the
 * platform ever moves off Vercel Cron.
 *
 * Every job returns a summary rather than logging and forgetting. The cron
 * response body is the only observability these have until Sentry is wired up,
 * and "it ran" is not the same as "it did something".
 */

export type JobResult = {
  job: string;
  ok: boolean;
  durationMs: number;
  details: Record<string, unknown>;
};

/**
 * Re-evaluate index eligibility for every live seller (decision D2).
 *
 * The write paths already recompute on profile and catalogue changes. This
 * exists to catch what they miss: a code path that forgot to call it, a rule
 * change made in admin settings, or a seller whose content was moderated by a
 * job rather than a request.
 *
 * A missed hook should therefore cost at most a day of staleness, never a
 * permanently wrong answer.
 */
export async function recomputeIndexabilityJob(): Promise<JobResult> {
  const startedAt = Date.now();

  const sellers = await db.seller.findMany({
    where: { deletedAt: null, status: { in: ["VERIFIED", "PENDING_VERIFICATION"] } },
    select: { id: true },
  });

  let changed = 0;
  let failed = 0;

  // Sequential, deliberately. This runs at 3am against 10,000 rows; doing it
  // concurrently would saturate the connection pool and compete with real
  // traffic for no benefit, since nothing is waiting on the result.
  for (const seller of sellers) {
    try {
      const before = await db.sellerWebsite.findUnique({
        where: { sellerId: seller.id },
        select: { indexable: true },
      });

      const result = await recomputeIndexability(seller.id);
      if (result && before && before.indexable !== result.eligible) changed += 1;
    } catch {
      failed += 1;
    }
  }

  return {
    job: "recompute-indexability",
    ok: failed === 0,
    durationMs: Date.now() - startedAt,
    details: { evaluated: sellers.length, changed, failed },
  };
}

/**
 * Reconcile denormalised counters (risk R7).
 *
 * `productCount` and `serviceCount` are maintained in the write path for
 * read performance. They drift the moment any path forgets to update them, and
 * drift is invisible — a wrong number looks exactly like a right one.
 */
export async function refreshCountersJob(): Promise<JobResult> {
  const startedAt = Date.now();

  const sellers = await db.seller.findMany({
    where: { deletedAt: null },
    select: { id: true, productCount: true, serviceCount: true },
  });

  let corrected = 0;

  for (const seller of sellers) {
    const [products, services] = await Promise.all([
      db.product.count({
        where: {
          sellerId: seller.id,
          status: "PUBLISHED",
          deletedAt: null,
          moderationStatus: "APPROVED",
        },
      }),
      db.service.count({
        where: {
          sellerId: seller.id,
          status: "PUBLISHED",
          deletedAt: null,
          moderationStatus: "APPROVED",
        },
      }),
    ]);

    if (products !== seller.productCount || services !== seller.serviceCount) {
      await db.seller.update({
        where: { id: seller.id },
        data: { productCount: products, serviceCount: services },
      });
      corrected += 1;
    }
  }

  // Category and location counts drive the homepage and facet displays.
  const categories = await db.category.findMany({ select: { id: true } });
  for (const category of categories) {
    const count = await db.product.count({
      where: {
        categoryId: category.id,
        status: "PUBLISHED",
        deletedAt: null,
        moderationStatus: "APPROVED",
      },
    });
    await db.category.update({ where: { id: category.id }, data: { productCount: count } });
  }

  const locations = await db.location.findMany({ select: { id: true } });
  for (const location of locations) {
    const count = await db.seller.count({
      where: { locationId: location.id, status: "VERIFIED", deletedAt: null },
    });
    await db.location.update({ where: { id: location.id }, data: { sellerCount: count } });
  }

  return {
    job: "refresh-counters",
    ok: true,
    durationMs: Date.now() - startedAt,
    details: {
      sellersChecked: sellers.length,
      sellersCorrected: corrected,
      categories: categories.length,
      locations: locations.length,
    },
  };
}

/**
 * Provision next month's AnalyticsEvent partition (decision D22).
 *
 * Runs monthly but is idempotent, so it is safe to run daily or on demand. The
 * DEFAULT partition means a missed run degrades to "rows land in default"
 * rather than "writes fail" — but rows arriving there are a signal that this
 * job stopped running, and should be alerted on.
 */
export async function createPartitionsJob(): Promise<JobResult> {
  const startedAt = Date.now();

  // Provision two months ahead: one missed run should not reach the cliff.
  await db.$executeRawUnsafe(
    `SELECT create_analytics_partition((CURRENT_DATE + interval '1 month')::date)`,
  );
  await db.$executeRawUnsafe(
    `SELECT create_analytics_partition((CURRENT_DATE + interval '2 months')::date)`,
  );

  const defaultRows = await db.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT count(*)::bigint AS count FROM "AnalyticsEvent_default"`,
  );

  const strayRows = Number(defaultRows[0]?.count ?? 0);

  return {
    job: "create-partitions",
    ok: true,
    durationMs: Date.now() - startedAt,
    details: {
      monthsProvisioned: 2,
      // Non-zero means a partition was missing when events arrived.
      rowsInDefaultPartition: strayRows,
      warning: strayRows > 0 ? "Rows landed in the DEFAULT partition" : null,
    },
  };
}

/**
 * Drop raw analytics older than the retention window (decision D17, risk R4).
 *
 * Partitions are dropped whole rather than rows deleted: `DROP TABLE` on a
 * partition is instant and reclaims the space, while `DELETE` on hundreds of
 * millions of rows would bloat the table and hold locks for hours.
 */
export async function pruneEventsJob(): Promise<JobResult> {
  const startedAt = Date.now();

  const stale = await db.$queryRawUnsafe<Array<{ relname: string }>>(
    `SELECT c.relname
     FROM pg_class c
     JOIN pg_inherits i ON i.inhrelid = c.oid
     JOIN pg_class p ON p.oid = i.inhparent
     WHERE p.relname = 'AnalyticsEvent'
       AND c.relname ~ '^AnalyticsEvent_[0-9]{4}_[0-9]{2}$'
       AND c.relname < ('AnalyticsEvent_' || to_char(CURRENT_DATE - interval '90 days', 'YYYY_MM'))`,
  );

  for (const partition of stale) {
    // Identifier comes from pg_class and is matched against a strict pattern
    // above, so it cannot carry injected SQL.
    await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "${partition.relname}"`);
  }

  const tokens = await pruneExpiredTokens();

  return {
    job: "prune-events",
    ok: true,
    durationMs: Date.now() - startedAt,
    details: { partitionsDropped: stale.map((p) => p.relname), expiredTokensDeleted: tokens },
  };
}

/**
 * Roll raw events into daily aggregates (risk R4).
 *
 * The rollups are permanent; the raw events are not. Doing this in SQL rather
 * than in application code keeps the whole aggregation inside one statement,
 * which matters once this is millions of rows a day.
 */
export async function rollupAnalyticsJob(): Promise<JobResult> {
  const startedAt = Date.now();

  const rows = await db.$executeRawUnsafe(`
    INSERT INTO "AnalyticsDaily" (
      "id", "sellerId", "date", "pageViews", "uniqueVisitors",
      "productViews", "enquiries", "whatsappClicks", "phoneReveals"
    )
    SELECT
      gen_random_uuid()::text,
      e."sellerId",
      date_trunc('day', e."createdAt")::date,
      count(*) FILTER (WHERE e."type" = 'page_view'),
      count(DISTINCT e."ipHash"),
      count(*) FILTER (WHERE e."type" = 'product_view'),
      count(*) FILTER (WHERE e."type" = 'enquiry_submit'),
      count(*) FILTER (WHERE e."type" = 'whatsapp_click'),
      count(*) FILTER (WHERE e."type" = 'phone_reveal')
    FROM "AnalyticsEvent" e
    WHERE e."createdAt" >= CURRENT_DATE - interval '2 days'
    GROUP BY e."sellerId", date_trunc('day', e."createdAt")
    ON CONFLICT ("sellerId", "date") DO UPDATE SET
      "pageViews"      = EXCLUDED."pageViews",
      "uniqueVisitors" = EXCLUDED."uniqueVisitors",
      "productViews"   = EXCLUDED."productViews",
      "enquiries"      = EXCLUDED."enquiries",
      "whatsappClicks" = EXCLUDED."whatsappClicks",
      "phoneReveals"   = EXCLUDED."phoneReveals"
  `);

  return {
    job: "rollup-analytics",
    ok: true,
    durationMs: Date.now() - startedAt,
    // Re-aggregating the last two days makes the job idempotent and self-healing
    // after a missed run, rather than leaving a permanent hole.
    details: { rowsUpserted: rows, window: "2 days" },
  };
}

export const JOBS = {
  "recompute-indexability": recomputeIndexabilityJob,
  "refresh-counters": refreshCountersJob,
  "create-partitions": createPartitionsJob,
  "prune-events": pruneEventsJob,
  "rollup-analytics": rollupAnalyticsJob,
} as const;

export type JobName = keyof typeof JOBS;
