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

export type AttachResult = { ok: true; position: number } | { ok: false; error: string };

/**
 * Attach one verified upload to one product.
 *
 * Called once per photo, after `confirmUploadAction` has verified it. One call
 * per photo rather than one for the batch so a single failure costs one
 * photograph and can be retried on its own — a batch call would make the
 * client's retry logic re-send everything.
 *
 * `replace` clears the product's existing photos the FIRST time it is called
 * for that product in a batch, which the client signals with `isFirst`.
 * Clearing on every call would delete each photo as the next one arrived and
 * leave exactly one at the end.
 */
export async function attachPhotoAction(input: {
  productId: string;
  /** The verified asset, as `confirmUploadAction` returned it. */
  asset: unknown;
  /** 1–12, from the file name. */
  position: number;
  replace: boolean;
  isFirst: boolean;
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
    select: { id: true, moderationStatus: true, _count: { select: { images: true } } },
  });

  if (!product) return { ok: false, error: "That product no longer exists." };

  const position = Number.isInteger(input.position)
    ? Math.min(Math.max(input.position, 1), MAX_PHOTOS_PER_PRODUCT)
    : 1;

  let existingCount = product._count.images;

  if (input.replace && input.isFirst) {
    // Scoped by sellerId as well as productId. The product is already known to
    // be this seller's, so this is the belt to the braces above.
    await db.productImage.deleteMany({ where: { productId, sellerId: scope.sellerId } });
    existingCount = 0;
  }

  if (existingCount >= MAX_PHOTOS_PER_PRODUCT) {
    return {
      ok: false,
      error: `This product already has ${MAX_PHOTOS_PER_PRODUCT} photos, which is the maximum.`,
    };
  }

  const image = parsed.data;

  await db.productImage.create({
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
      // `_1` means the main photo, so the file name decides the order. Offset
      // by the photos already there when adding rather than replacing, so a
      // second batch lands after the first instead of fighting it for slot 1.
      sortOrder: existingCount + position - 1,
      // Inherited from the product: a photo added to an approved product is
      // approved, one added to a pending product waits with it (D38).
      moderationStatus: product.moderationStatus,
    },
    select: { id: true },
  });

  return { ok: true, position };
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
