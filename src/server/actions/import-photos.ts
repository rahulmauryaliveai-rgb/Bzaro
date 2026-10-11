"use server";

import { revalidatePath } from "next/cache";
import { requireSeller } from "@/lib/auth/guards";
import { forSeller } from "@/lib/db-tenant";
import { db } from "@/lib/db";
import { revalidateProduct } from "@/lib/cache/revalidate";
import { productImageSchema } from "@/lib/validation/catalog";
import {
  matchPhotos,
  MAX_PHOTOS_PER_PRODUCT,
  type PhotoMatch,
  type PhotoTarget,
} from "@/lib/import/photo-names";

/**
 * Bulk photo upload (D49).
 *
 * ── The upload itself does not come through here ───────────────────────────
 * Photos go browser → CDN through the existing signed-upload flow
 * (`requestUploadAction` → upload → `confirmUploadAction`), exactly as the
 * single-product form does. Image bytes never reach the application server,
 * and `confirmUploadAction` has already verified the provider's signature and
 * that the asset landed in THIS seller's folder before anything below runs.
 *
 * What is left for these actions is the two things that flow cannot do:
 * work out which product a file name means, and attach a verified asset to
 * that product.
 *
 * ── Every attach re-checks ownership ──────────────────────────────────────
 * The product id arrives from the browser, which decided it from a match the
 * server computed — but a crafted request can send any id at all. So the
 * attach reads the product through the tenant client first and refuses an id
 * that is not this seller's, and the insert carries `sellerId` as well. That
 * is three independent reasons a cross-tenant attach fails, and
 * `tests/e2e/tenant-isolation.spec.ts` exercises it.
 */

export type MatchPhotosState =
  | { ok: true; match: PhotoMatch; products: PhotoTarget[] }
  | { ok: false; error: string };

/** Mirrors the 500-per-batch cap the UI states. */
const MAX_FILES_PER_BATCH = 500;

/**
 * Work out which product each file name belongs to.
 *
 * Takes names only — no bytes — so the whole preview costs one query and
 * nothing is uploaded until the seller has seen and approved the plan. On a
 * phone connection that ordering is the difference between a mistake costing
 * a moment and costing fifty megabytes of upload.
 */
export async function matchPhotosAction(
  fileNames: string[],
  mode: "add" | "replace",
): Promise<MatchPhotosState> {
  const scope = await requireSeller();

  if (!Array.isArray(fileNames) || fileNames.length === 0) {
    return { ok: false, error: "Choose some photos first." };
  }

  if (fileNames.length > MAX_FILES_PER_BATCH) {
    return {
      ok: false,
      error: `That is ${fileNames.length} files. Upload up to ${MAX_FILES_PER_BATCH} at a time.`,
    };
  }

  const products = await listPhotoTargets(scope.sellerId);

  if (products.length === 0) {
    return {
      ok: false,
      error: "None of your products have a SKU yet. Add product codes first, then upload photos.",
    };
  }

  // Names are capped before they are echoed back into the page: they come from
  // the client and are rendered next to a dropdown.
  const safeNames = fileNames.map((name) => String(name).slice(0, 300));

  return {
    ok: true,
    match: matchPhotos({ fileNames: safeNames, products, mode: mode === "replace" ? "replace" : "add" }),
    products,
  };
}

/** This seller's products that a photo could belong to. */
async function listPhotoTargets(sellerId: string): Promise<PhotoTarget[]> {
  const tdb = forSeller(sellerId);

  const rows = await tdb.product.findMany({
    where: { deletedAt: null, sku: { not: null } },
    select: { id: true, name: true, sku: true, _count: { select: { images: true } } },
    orderBy: { name: "asc" },
    take: 2000,
  });

  return rows.flatMap((row) =>
    row.sku
      ? [{ id: row.id, name: row.name, sku: row.sku, imageCount: row._count.images }]
      : [],
  );
}

/** Products offered in the "assign by hand" dropdown. */
export async function listAssignableProductsAction(): Promise<PhotoTarget[]> {
  const scope = await requireSeller();
  return listPhotoTargets(scope.sellerId);
}

export type ClearResult = { ok: true; cleared: number } | { ok: false; error: string };

/**
 * Delete every photo on these products, once, before a replace batch starts.
 *
 * ── Why this is its own call ───────────────────────────────────────────────
 * Clearing used to happen inside the first attach of each product, flagged by
 * an `isFirst` argument. With three uploads running concurrently that was
 * wrong twice over:
 *
 *   - "first" meant first to be QUEUED, not first to arrive. If the second
 *     photo finished uploading before the first, it attached, and then the
 *     first photo's attach cleared it away again. The seller ended up with
 *     fewer photos than they uploaded, varying by network timing.
 *   - If attempt 1 of the designated first file failed before reaching the
 *     attach, nothing ever cleared, and the "replace" silently behaved like
 *     "add" — the one outcome a seller choosing Replace would notice least
 *     and want least.
 *
 * Doing it once, up front, for every product in the batch removes both. It
 * also makes the destructive step explicit and ordered: photos are gone before
 * any upload starts, so there is no window in which old and new coexist and
 * the cap arithmetic is wrong.
 */
export async function clearProductPhotosAction(productIds: string[]): Promise<ClearResult> {
  const scope = await requireSeller();

  const ids = (Array.isArray(productIds) ? productIds : [])
    .map((id) => String(id).trim())
    .filter(Boolean)
    .slice(0, MAX_FILES_PER_BATCH);

  if (ids.length === 0) return { ok: true, cleared: 0 };

  const tdb = forSeller(scope.sellerId);

  // Narrow to the ids that are genuinely this seller's. A foreign id is simply
  // absent from the result rather than refused, so one crafted id cannot stop
  // the seller's own batch.
  const owned = await tdb.product.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true },
  });

  if (owned.length === 0) return { ok: true, cleared: 0 };

  const result = await db.productImage.deleteMany({
    where: { productId: { in: owned.map((product) => product.id) }, sellerId: scope.sellerId },
  });

  return { ok: true, cleared: result.count };
}

export type AttachResult = { ok: true; sortOrder: number } | { ok: false; error: string };

/**
 * Attach one verified upload to one product.
 *
 * Called once per photo, after `confirmUploadAction` has verified it. One call
 * per photo rather than one for the batch so a single failure costs one
 * photograph and can be retried on its own — a batch call would make the
 * client's retry logic re-send everything.
 *
 * `sortOrder` is decided by the matcher, not here: see `MatchedFile.sortOrder`
 * for why counting rows at attach time cannot work with concurrent uploads.
 */
export async function attachPhotoAction(input: {
  productId: string;
  /** The verified asset, as `confirmUploadAction` returned it. */
  asset: unknown;
  /** Decided at match time from the file name. */
  sortOrder: number;
}): Promise<AttachResult> {
  const scope = await requireSeller();

  const productId = String(input.productId ?? "").trim();
  if (!productId) return { ok: false, error: "Unknown product." };

  // Validated with the same schema the single-product form uses, so an image
  // row written here cannot be shaped differently from one written there.
  const parsed = productImageSchema.safeParse(input.asset);
  if (!parsed.success) {
    return { ok: false, error: "That upload could not be verified." };
  }

  const tdb = forSeller(scope.sellerId);

  // The ownership check. Reading through the tenant client means another
  // seller's product id matches nothing, and is reported as not existing
  // rather than as forbidden — a 403 would confirm the id is real.
  const product = await tdb.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: { id: true, moderationStatus: true },
  });

  if (!product) return { ok: false, error: "That product no longer exists." };

  const image = parsed.data;

  // Clamped rather than rejected: a bad value from the client costs a photo
  // in the wrong position, not a failed upload the seller has to repeat.
  const sortOrder = Number.isInteger(input.sortOrder)
    ? Math.min(Math.max(input.sortOrder, 0), MAX_PHOTOS_PER_PRODUCT - 1)
    : 0;

  try {
    await db.$transaction(async (tx) => {
      // ── The cap, counted and enforced in ONE transaction ──
      // Counting outside the transaction is the same race as `sortOrder`: three
      // concurrent attaches each read 11, each decide there is room, and the
      // product ends up with 14 photos. Inside a transaction the count and the
      // insert cannot be interleaved by another attach, so the twelfth photo is
      // the last one that succeeds.
      const existing = await tx.productImage.count({
        where: { productId, sellerId: scope.sellerId },
      });

      if (existing >= MAX_PHOTOS_PER_PRODUCT) throw new PhotoCapReached();

      await tx.productImage.create({
        data: {
          productId,
          sellerId: scope.sellerId,
          provider: image.provider ?? "CLOUDINARY",
          publicId: image.publicId ?? "",
          url: image.url,
          alt: image.alt?.trim() || null,
          width: image.width ?? null,
          height: image.height ?? null,
          bytes: image.bytes ?? null,
          mimeType: image.mimeType?.trim() || null,
          sortOrder,
          // Inherited from the product: a photo added to an approved product is
          // approved, one added to a pending product waits with it (D38).
          moderationStatus: product.moderationStatus,
        },
        select: { id: true },
      });
    });
  } catch (error) {
    if (error instanceof PhotoCapReached) {
      return {
        ok: false,
        error: `This product already has ${MAX_PHOTOS_PER_PRODUCT} photos, which is the maximum.`,
      };
    }
    throw error;
  }

  return { ok: true, sortOrder };
}

/** Thrown inside the attach transaction to roll it back and report the cap. */
class PhotoCapReached extends Error {
  constructor() {
    super("photo cap reached");
    this.name = "PhotoCapReached";
  }
}

/**
 * Called once when a photo batch finishes.
 *
 * The cache work is a whole-catalogue operation, so doing it per photo would
 * mean five hundred invalidations for one batch. The client calls this at the
 * end instead.
 */
export async function finishPhotoBatchAction(): Promise<void> {
  const scope = await requireSeller();

  revalidateProduct(scope.sellerSlug);
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/products/import/photos");
}
