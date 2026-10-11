import "server-only";
import { db, Prisma } from "@/lib/db";
import { forSeller } from "@/lib/db-tenant";
import { revalidateProduct } from "@/lib/cache/revalidate";
import { revalidateSellerDiscovery } from "@/server/services/discovery.service";
import { recomputeIndexability } from "@/server/services/indexability.service";
import { getModerationSignals } from "@/server/services/catalog.service";
import { decideModeration } from "@/lib/validation/moderation";
import { getActivePlan } from "@/server/services/plan.service";
import { uniqueSlug } from "@/lib/utils/slug";
import { parseMoneyToMinor } from "@/lib/utils/money";
import type { ProductInput } from "@/lib/validation/catalog";
import { formatIssue, type ParsedRow, type RowIssue } from "@/lib/import/parse";
import type { StagedBatch } from "@/lib/import/store";

/**
 * Writing an imported spreadsheet to the catalogue (D49).
 *
 * ── Chunked, not one transaction ────────────────────────────────────────────
 * A thousand products in a single transaction holds locks for seconds and, on
 * a pooled connection, risks a statement timeout that rolls back the entire
 * import after a minute of work. Chunks of a hundred mean a failure costs at
 * most the current chunk, and the ImportJob row then says honestly that the
 * import was partial. A seller who can see which rows landed can re-upload the
 * rest; a seller whose whole file silently vanished cannot.
 *
 * ── Blank means "leave it alone" ────────────────────────────────────────────
 * On an update, only the cells the seller filled are written. This is the
 * single most important rule in the file. A seller correcting forty prices
 * deletes the other columns from their spreadsheet to keep it readable — and
 * if blank meant "clear", that import would wipe every description, brand and
 * specification table in the catalogue. The behaviour is not configurable,
 * because the destructive reading is never what anyone wants from a column
 * they did not fill in.
 *
 * ── Photographs are never touched ───────────────────────────────────────────
 * The sheet has no photo column, so an update leaves existing images exactly
 * as they are. That is what makes "upload the spreadsheet again to fix prices"
 * safe after the photos have been added.
 */

/** Written per transaction. Large enough to be fast, small enough to recover. */
const CHUNK_SIZE = 100;

export type ImportOutcome = {
  jobId: string;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  /** Rows that were valid at preview but could not be written now. */
  issues: RowIssue[];
};

/**
 * How many more products this seller's plan allows.
 *
 * Counts every non-deleted product, published or not: a draft occupies a slot
 * because it is a product the seller can publish at any moment. Free plan
 * (no live subscription) falls back to the Free plan's own ceiling rather than
 * to unlimited — an absent subscription must never be the generous case.
 */
export async function getRemainingProductSlots(sellerId: string): Promise<{
  remaining: number;
  limit: number;
  used: number;
  planName: string;
}> {
  const tdb = forSeller(sellerId);

  const [subscription, used, freePlan] = await Promise.all([
    getActivePlan(sellerId),
    tdb.product.count({ where: { deletedAt: null } }),
    db.plan.findFirst({ where: { key: "free" }, select: { maxProducts: true, name: true } }),
  ]);

  const limit = subscription?.plan.maxProducts ?? freePlan?.maxProducts ?? 10;
  const planName = subscription?.plan.name ?? freePlan?.name ?? "Free";

  return { remaining: Math.max(0, limit - used), limit, used, planName };
}

/** This seller's saved SKUs, lower-cased → product id. */
export async function getExistingSkus(sellerId: string): Promise<Map<string, string>> {
  const tdb = forSeller(sellerId);

  const rows = await tdb.product.findMany({
    where: { deletedAt: null, sku: { not: null } },
    select: { id: true, sku: true },
  });

  const map = new Map<string, string>();
  // The column is citext, so the database already treats these
  // case-insensitively; lower-casing the key matches that here.
  for (const row of rows) if (row.sku) map.set(row.sku.trim().toLowerCase(), row.id);

  return map;
}

// ── The import job row ──────────────────────────────────────────────────────

export async function createImportJob(input: {
  sellerId: string;
  fileName: string;
  fileSize: number;
  totalRows: number;
  errorRows: number;
  skippedRows: number;
  issues: RowIssue[];
}): Promise<string> {
  const job = await db.importJob.create({
    data: {
      sellerId: input.sellerId,
      // Stored for the seller to recognise, never used as a path. Capped
      // because it is rendered, and a 4 KB "file name" is not a file name.
      fileName: input.fileName.slice(0, 255),
      fileSize: input.fileSize,
      status: "PENDING",
      totalRows: input.totalRows,
      errorRows: input.errorRows,
      skippedRows: input.skippedRows,
      errors: issuesForStorage(input.issues),
    },
    select: { id: true },
  });

  return job.id;
}

/**
 * Keep the first fifty problems, not all of them.
 *
 * A thousand-row file with a missing column produces a thousand identical
 * errors, and storing them all bloats every read of the import history for no
 * added information. The full set is in the downloadable error report, which
 * is generated from the staged batch while it lives.
 */
function issuesForStorage(issues: RowIssue[]): Prisma.InputJsonValue {
  return issues.slice(0, 50).map((issue) => ({
    row: issue.row,
    column: issue.column,
    message: issue.message,
  }));
}

export async function listRecentImports(sellerId: string) {
  const tdb = forSeller(sellerId);

  return tdb.importJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      fileName: true,
      status: true,
      totalRows: true,
      createdRows: true,
      updatedRows: true,
      errorRows: true,
      skippedRows: true,
      createdAt: true,
      finishedAt: true,
    },
  });
}

// ── The write ───────────────────────────────────────────────────────────────

/**
 * Import a staged batch.
 *
 * ── The double-submit guard ─────────────────────────────────────────────────
 * A seller on a slow connection presses Import, sees nothing happen, and
 * presses it again. Without a guard that is forty products imported twice —
 * and since the second run sees the first run's SKUs, it arrives as forty
 * pointless updates rather than an obvious mess, so nobody notices.
 *
 * The guard is a conditional UPDATE on the job row: `PENDING → RUNNING` where
 * the status is still PENDING. The database decides the winner, so two
 * concurrent requests cannot both proceed. A caller who loses is told the
 * import is already running rather than being shown an error.
 */
export async function runImport(input: {
  sellerId: string;
  sellerSlug: string;
  batch: StagedBatch;
}): Promise<ImportOutcome | { alreadyRunning: true }> {
  const { sellerId, sellerSlug, batch } = input;

  const claimed = await db.importJob.updateMany({
    where: { id: batch.jobId, sellerId, status: "PENDING" },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  if (claimed.count === 0) return { alreadyRunning: true };

  const importable = batch.rows.filter((row) => row.status === "new" || row.status === "update");

  // Moderation is decided ONCE for the whole batch, not per row: it is a
  // property of the seller (D38), and re-deriving it a thousand times would be
  // a thousand identical queries.
  const signals = await getModerationSignals(sellerId);
  const moderationStatus = decideModeration(signals).status;

  const slugs = await takenSlugs(sellerId);
  const issues: RowIssue[] = [];

  let created = 0;
  let updated = 0;
  let failed = 0;

  for (let start = 0; start < importable.length; start += CHUNK_SIZE) {
    const chunk = importable.slice(start, start + CHUNK_SIZE);

    try {
      const result = await writeChunk({ sellerId, chunk, moderationStatus, slugs });
      created += result.created;
      updated += result.updated;
    } catch (error) {
      // The chunk rolled back. Rather than abandoning the import, each of its
      // rows is retried alone, so one bad row costs one product instead of a
      // hundred — which is the difference between "three rows failed, here
      // they are" and "the import did nothing".
      for (const row of chunk) {
        try {
          const single = await writeChunk({
            sellerId,
            chunk: [row],
            moderationStatus,
            slugs,
          });
          created += single.created;
          updated += single.updated;
        } catch (rowError) {
          failed += 1;
          issues.push({
            row: row.row,
            column: "",
            message: writeFailureMessage(rowError),
          });
        }
      }
      void error;
    }
  }

  const skipped = batch.rows.filter((row) => row.status === "over_limit").length;
  const errorRows = batch.rows.filter((row) => row.status === "error").length + failed;

  const job = await db.importJob.update({
    where: { id: batch.jobId },
    data: {
      status: errorRows > 0 || skipped > 0 ? "PARTIAL" : "COMPLETED",
      createdRows: created,
      updatedRows: updated,
      errorRows,
      skippedRows: skipped,
      errors: issuesForStorage([
        ...batch.rows.flatMap((row) => row.issues),
        ...issues,
      ]),
      finishedAt: new Date(),
    },
    select: { id: true },
  });

  // ── Once, at the end ──
  // Every one of these is a whole-catalogue operation. Running them per row
  // would mean a thousand indexability recomputes and a thousand cache
  // invalidations for one import, which is how a working feature takes a
  // database down.
  if (created > 0 || updated > 0) {
    await recomputeIndexability(sellerId).catch(() => undefined);
    revalidateProduct(sellerSlug);
    await revalidateSellerDiscovery(sellerId).catch(() => undefined);
    await recountImportedCategories(batch.rows).catch(() => undefined);
  }

  return { jobId: job.id, created, updated, skipped, failed, issues };
}

type ChunkInput = {
  sellerId: string;
  chunk: ParsedRow[];
  moderationStatus: "PENDING" | "APPROVED";
  slugs: Set<string>;
};

/**
 * One transaction: all of these rows, or none of them.
 *
 * Interactive rather than a batched array, because a create needs its new id
 * to be of any use and an update has to read the existing row first to honour
 * "blank keeps what is there".
 */
async function writeChunk(
  input: ChunkInput,
): Promise<{ created: number; updated: number }> {
  const { sellerId, chunk, moderationStatus, slugs } = input;

  return db.$transaction(
    async (tx) => {
      let created = 0;
      let updated = 0;

      for (const row of chunk) {
        if (!row.input) continue;

        if (row.productId) {
          // `updateMany` with sellerId in the filter, not `update` by id: an id
          // that is not this seller's matches zero rows instead of writing.
          // The id came from our own SKU lookup, so this should be impossible
          // — which is exactly when it is worth making impossible.
          const result = await tx.product.updateMany({
            where: { id: row.productId, sellerId, deletedAt: null },
            data: await updateData(tx, row.productId, sellerId, row.input),
          });
          if (result.count > 0) updated += 1;
          continue;
        }

        const slug = uniqueSlug(row.input.slug, slugs);
        slugs.add(slug);

        await tx.product.create({
          data: {
            sellerId,
            slug,
            ...createData(row.input),
            moderationStatus,
          },
          select: { id: true },
        });

        created += 1;
      }

      return { created, updated };
    },
    // A hundred rows of inserts is comfortably inside this; the ceiling exists
    // so a pathological chunk fails rather than holding locks indefinitely.
    { timeout: 30_000 },
  );
}

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/** Columns for a new product. Mirrors `productData` in catalog.service. */
function createData(input: ProductInput) {
  const currency = input.currency || "INR";

  return {
    name: input.name,
    categoryId: emptyToNull(input.categoryId),
    shortDescription: emptyToNull(input.shortDescription),
    description: emptyToNull(input.description),
    brand: emptyToNull(input.brand),
    sku: emptyToNull(input.sku),
    modelNumber: emptyToNull(input.modelNumber),
    priceMinor: parseMoneyToMinor(input.price, currency) ?? null,
    priceMaxMinor: parseMoneyToMinor(input.priceMax, currency) ?? null,
    currency,
    unit: emptyToNull(input.unit),
    minOrderQty: toInt(input.minOrderQty),
    priceOnRequest: input.priceOnRequest,
    specifications: input.specifications,
    tags: input.tags,
    // Always a draft. The seller publishes once there are photographs — see
    // the publish step on the products list.
    status: "DRAFT" as const,
  };
}

/**
 * Columns for an update: only the ones the spreadsheet actually filled.
 *
 * The existing row is read so "blank" can be distinguished from "same as
 * before" without writing anything. Price is the subtle case: a blank price
 * cell must leave BOTH the stored price and `priceOnRequest` alone, because
 * clearing the price of a product that has one is a public, visible change
 * nobody asked for.
 */
async function updateData(
  tx: TxClient,
  productId: string,
  sellerId: string,
  input: ProductInput,
) {
  const existing = await tx.product.findFirst({
    where: { id: productId, sellerId },
    select: { priceMinor: true, priceOnRequest: true },
  });

  const currency = input.currency || "INR";
  const data: Prisma.ProductUncheckedUpdateManyInput = {};

  /** Write a text column only when the cell had something in it. */
  const text = <K extends keyof Prisma.ProductUncheckedUpdateManyInput>(
    column: K,
    value: string | undefined,
  ) => {
    const trimmed = value?.trim();
    if (trimmed) data[column] = trimmed as Prisma.ProductUncheckedUpdateManyInput[K];
  };

  // The name is required by the schema, so it is always present.
  text("name", input.name);
  text("categoryId", input.categoryId);
  text("shortDescription", input.shortDescription);
  text("description", input.description);
  text("brand", input.brand);
  text("modelNumber", input.modelNumber);
  text("unit", input.unit);

  const priceMinor = input.price?.trim() ? parseMoneyToMinor(input.price, currency) : undefined;
  if (priceMinor !== undefined && priceMinor !== null) {
    data.priceMinor = priceMinor;
    // A price was given, so the product is no longer "ask for price" —
    // otherwise the number would be stored and never shown.
    data.priceOnRequest = false;
  } else if (existing && existing.priceMinor === null) {
    // No price here and none stored: keep it on request, which is what it
    // already was.
    data.priceOnRequest = existing.priceOnRequest;
  }

  const priceMaxMinor = input.priceMax?.trim()
    ? parseMoneyToMinor(input.priceMax, currency)
    : undefined;
  if (priceMaxMinor !== undefined && priceMaxMinor !== null) data.priceMaxMinor = priceMaxMinor;

  const minOrderQty = toInt(input.minOrderQty);
  if (minOrderQty !== null) data.minOrderQty = minOrderQty;

  // An empty specifications cell keeps the stored table; a filled one replaces
  // it wholesale, because "Key: Value | Key: Value" describes the whole table
  // and merging row-by-row would leave a stale row the seller deleted.
  if (input.specifications.length > 0) data.specifications = input.specifications;
  if (input.tags.length > 0) data.tags = input.tags;

  return data;
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toInt(value: string | null | undefined): number | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Slugs already used in this tenant, so generated ones do not collide. */
async function takenSlugs(sellerId: string): Promise<Set<string>> {
  const tdb = forSeller(sellerId);
  const rows = await tdb.product.findMany({ select: { slug: true } });
  return new Set(rows.map((row) => row.slug.toLowerCase()));
}

/**
 * A write failure, in words a seller can act on.
 *
 * Only the cases a seller can actually fix are named. Anything else stays
 * generic: a seller cannot do anything with a connection-pool message, and
 * echoing database internals into a dashboard is how schema details end up in
 * a support ticket.
 */
function writeFailureMessage(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return "a product with this code already exists — give it a different SKU";
    }
    if (error.code === "P2003" || error.code === "P2025") {
      return "the category for this row no longer exists — pick another";
    }
  }
  return "this row could not be saved. Try uploading it again.";
}

/**
 * Re-count the categories the import touched.
 *
 * Only the affected categories and their ancestors, not the whole tree: the
 * nightly `refresh-counters` job owns the full sweep (and the roll-up), and
 * repeating that work for one import would walk 400 categories to correct a
 * handful.
 *
 * Counts only PUBLISHED and APPROVED products, matching the job — an import
 * writes drafts, so this usually changes nothing. It is here for the case that
 * does change something: a re-upload that updates products already live.
 */
async function recountImportedCategories(rows: ParsedRow[]): Promise<void> {
  const touched = new Set(
    rows.flatMap((row) => {
      const id = row.input?.categoryId;
      return id ? [id] : [];
    }),
  );

  if (touched.size === 0) return;

  // Counts ROLL UP (D44): filing a product under "LED Bulbs" changes the
  // number shown for "Lighting" and for "Electronics & Electrical" too, so
  // every ANCESTOR of a touched category has to be re-counted as well. Only
  // ancestors — a descendant's own count cannot have changed.
  const leaves = await db.category.findMany({
    where: { id: { in: [...touched] } },
    select: { id: true, ancestorIds: true },
  });

  const affected = new Set<string>();
  for (const leaf of leaves) {
    affected.add(leaf.id);
    for (const ancestorId of leaf.ancestorIds) affected.add(ancestorId);
  }

  for (const categoryId of affected) {
    const count = await db.product.count({
      where: {
        status: "PUBLISHED",
        moderationStatus: "APPROVED",
        deletedAt: null,
        OR: [{ categoryId }, { category: { ancestorIds: { has: categoryId } } }],
      },
    });

    await db.category.update({ where: { id: categoryId }, data: { productCount: count } });
  }
}

export { formatIssue };
