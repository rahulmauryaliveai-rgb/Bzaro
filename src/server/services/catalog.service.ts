import "server-only";
import { db } from "@/lib/db";
import { forSeller } from "@/lib/db-tenant";
import { revalidateProduct, revalidateService } from "@/lib/cache/revalidate";
import { revalidateSellerDiscovery } from "@/server/services/discovery.service";
import { recomputeIndexability } from "@/server/services/indexability.service";
import { decideModeration, editRequiresRereview } from "@/lib/validation/moderation";
import type { ModerationSignals } from "@/lib/validation/moderation";
import { uniqueSlug } from "@/lib/utils/slug";
import { parseMoneyToMinor } from "@/lib/utils/money";
import type { ProductInput, ServiceInput } from "@/lib/validation/catalog";

/**
 * Catalogue CRUD: products and services.
 *
 * ── Three things every write here has to do ──────────────────────────────────
 *   1. Stay inside the tenant. Reads and writes go through `forSeller()`, which
 *      injects `sellerId` mechanically rather than trusting each call site.
 *   2. Decide moderation (D10). New sellers are reviewed; trusted sellers are
 *      not. The decision is made here, never taken from the form.
 *   3. Recompute indexability (D2). The gate counts PUBLISHED + APPROVED
 *      products and services, so publishing the third product is exactly the
 *      moment a seller's site becomes eligible for search — and the dashboard
 *      must say so immediately, not tomorrow.
 *
 * Forgetting (3) is the subtle one: the feature still appears to work, and the
 * seller simply never learns why their site is still invisible.
 */

export type CatalogKind = "product" | "service";

export type SaveResult =
  | { ok: true; id: string; slug: string; moderation: "PENDING" | "APPROVED"; reason: string }
  | { ok: false; reason: "not_found"; message: string };

const NOT_DELETED = { deletedAt: null } as const;

/** Empty form field → NULL, so the database never stores "". */
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

/**
 * Gather this seller's moderation history.
 *
 * Counts across products, services AND gallery items: D10 makes trust a
 * property of the SELLER, not of one content type. A seller whose gallery
 * photograph was rejected has not earned auto-approval for products, and a
 * seller who cleared review once on any of the three should not be reviewed
 * again for the next.
 */
export async function getModerationSignals(sellerId: string): Promise<ModerationSignals> {
  const tdb = forSeller(sellerId);

  /** Same count across all three content types, summed. */
  const across = async (moderationStatus: "APPROVED" | "REJECTED" | "FLAGGED") => {
    const counts = await Promise.all([
      tdb.product.count({ where: { moderationStatus, ...NOT_DELETED } }),
      tdb.service.count({ where: { moderationStatus, ...NOT_DELETED } }),
      tdb.galleryItem.count({ where: { moderationStatus, ...NOT_DELETED } }),
    ]);
    return counts.reduce((total, count) => total + count, 0);
  };

  const [seller, approved, rejected, flagged] = await Promise.all([
    db.seller.findUnique({ where: { id: sellerId }, select: { status: true } }),
    across("APPROVED"),
    across("REJECTED"),
    across("FLAGGED"),
  ]);

  return {
    sellerStatus: seller?.status ?? "DRAFT",
    approvedItems: approved,
    rejectedItems: rejected,
    flaggedItems: flagged,
  };
}

/**
 * Reserve a slug that is free within this tenant.
 *
 * `excludeId` lets an edit keep its own slug: without it, saving a product
 * without renaming it would collide with itself and silently bump to `-2`.
 */
async function reserveSlug(
  sellerId: string,
  kind: CatalogKind,
  desired: string,
  excludeId?: string,
): Promise<string> {
  const tdb = forSeller(sellerId);

  const rows =
    kind === "product"
      ? await tdb.product.findMany({ select: { id: true, slug: true } })
      : await tdb.service.findMany({ select: { id: true, slug: true } });

  const taken = rows.filter((row) => row.id !== excludeId).map((row) => row.slug);

  return uniqueSlug(desired, taken);
}

// ══════════════════════════════ PRODUCTS ═════════════════════════════════════

export async function listProducts(sellerId: string) {
  const tdb = forSeller(sellerId);

  return tdb.product.findMany({
    where: NOT_DELETED,
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      moderationStatus: true,
      priceMinor: true,
      priceMaxMinor: true,
      currency: true,
      unit: true,
      priceOnRequest: true,
      enquiryCount: true,
      viewCount: true,
      updatedAt: true,
      category: { select: { name: true } },
      images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true, alt: true } },
    },
    orderBy: [{ updatedAt: "desc" }],
  });
}

export async function getProductForEdit(sellerId: string, id: string) {
  const tdb = forSeller(sellerId);

  return tdb.product.findFirst({
    where: { id, ...NOT_DELETED },
    include: { images: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function createProduct(
  sellerId: string,
  sellerSlug: string,
  input: ProductInput,
): Promise<SaveResult> {
  const slug = await reserveSlug(sellerId, "product", input.slug);
  const signals = await getModerationSignals(sellerId);
  const decision = decideModeration(signals);

  const product = await db.product.create({
    data: {
      sellerId,
      slug,
      ...productData(input),
      moderationStatus: decision.status,
      images: {
        create: input.images.map((image, index) =>
          imageRow(image, sellerId, index, decision.status),
        ),
      },
    },
    select: { id: true, slug: true },
  });

  await afterCatalogWrite(sellerId, sellerSlug, "product", product.id);

  return {
    ok: true,
    id: product.id,
    slug: product.slug,
    moderation: decision.status,
    reason: decision.reason,
  };
}

export async function updateProduct(
  sellerId: string,
  sellerSlug: string,
  id: string,
  input: ProductInput,
): Promise<SaveResult> {
  const tdb = forSeller(sellerId);

  const existing = await tdb.product.findFirst({
    where: { id, ...NOT_DELETED },
    select: { id: true, moderationStatus: true },
  });

  if (!existing) {
    return { ok: false, reason: "not_found", message: "That product no longer exists." };
  }

  const slug = await reserveSlug(sellerId, "product", input.slug, id);
  const signals = await getModerationSignals(sellerId);

  // An edit only returns content to review for sellers who have not earned
  // trust — otherwise moderation is bypassed by editing an approved listing.
  const rereview = editRequiresRereview(signals, existing.moderationStatus);
  const moderationStatus = rereview ? "PENDING" : existing.moderationStatus;

  await db.$transaction([
    db.product.update({
      where: { id },
      data: { slug, ...productData(input), moderationStatus },
    }),
    // Images are replaced wholesale rather than diffed. The set is small and
    // ordered, and a diff would have to reconcile order, alt text and identity
    // for no benefit a seller can perceive.
    db.productImage.deleteMany({ where: { productId: id } }),
    db.productImage.createMany({
      data: input.images.map((image, index) => ({
        productId: id,
        ...imageRow(image, sellerId, index, moderationStatus),
      })),
    }),
  ]);

  await afterCatalogWrite(sellerId, sellerSlug, "product", id);

  return {
    ok: true,
    id,
    slug,
    moderation: moderationStatus === "APPROVED" ? "APPROVED" : "PENDING",
    reason: rereview
      ? "Your changes are being reviewed before they appear publicly."
      : "Changes are live.",
  };
}

/**
 * Map one submitted image to a `ProductImage` row.
 *
 * `publicId` stays empty for a pasted link, which is how the two origins are
 * told apart later: a row with a public id came from our own upload and can be
 * deleted from the CDN, a row without one is hosted somewhere we do not
 * control. Inventing an id for the second kind would make that distinction
 * unrecoverable.
 */
function imageRow(
  image: ProductInput["images"][number],
  sellerId: string,
  index: number,
  moderationStatus: "PENDING" | "APPROVED" | "REJECTED" | "FLAGGED",
) {
  return {
    sellerId,
    provider: image.provider ?? ("CLOUDINARY" as const),
    publicId: image.publicId ?? "",
    url: image.url,
    alt: emptyToNull(image.alt),
    width: image.width ?? null,
    height: image.height ?? null,
    bytes: image.bytes ?? null,
    mimeType: emptyToNull(image.mimeType),
    sortOrder: index,
    moderationStatus,
  };
}

/** Shared column mapping for create and update. */
function productData(input: ProductInput) {
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
    metaTitle: emptyToNull(input.metaTitle),
    metaDescription: emptyToNull(input.metaDescription),
    status: input.status,
  };
}

// ══════════════════════════════ SERVICES ═════════════════════════════════════

export async function listServices(sellerId: string) {
  const tdb = forSeller(sellerId);

  return tdb.service.findMany({
    where: NOT_DELETED,
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      moderationStatus: true,
      priceMinor: true,
      currency: true,
      pricingModel: true,
      priceOnRequest: true,
      enquiryCount: true,
      viewCount: true,
      updatedAt: true,
      imageUrl: true,
      category: { select: { name: true } },
    },
    orderBy: [{ updatedAt: "desc" }],
  });
}

export async function getServiceForEdit(sellerId: string, id: string) {
  const tdb = forSeller(sellerId);
  return tdb.service.findFirst({ where: { id, ...NOT_DELETED } });
}

export async function createService(
  sellerId: string,
  sellerSlug: string,
  input: ServiceInput,
): Promise<SaveResult> {
  const slug = await reserveSlug(sellerId, "service", input.slug);
  const signals = await getModerationSignals(sellerId);
  const decision = decideModeration(signals);

  const service = await db.service.create({
    data: {
      sellerId,
      slug,
      ...serviceData(input),
      moderationStatus: decision.status,
    },
    select: { id: true, slug: true },
  });

  await afterCatalogWrite(sellerId, sellerSlug, "service", service.id);

  return {
    ok: true,
    id: service.id,
    slug: service.slug,
    moderation: decision.status,
    reason: decision.reason,
  };
}

export async function updateService(
  sellerId: string,
  sellerSlug: string,
  id: string,
  input: ServiceInput,
): Promise<SaveResult> {
  const tdb = forSeller(sellerId);

  const existing = await tdb.service.findFirst({
    where: { id, ...NOT_DELETED },
    select: { id: true, moderationStatus: true },
  });

  if (!existing) {
    return { ok: false, reason: "not_found", message: "That service no longer exists." };
  }

  const slug = await reserveSlug(sellerId, "service", input.slug, id);
  const signals = await getModerationSignals(sellerId);

  const rereview = editRequiresRereview(signals, existing.moderationStatus);
  const moderationStatus = rereview ? "PENDING" : existing.moderationStatus;

  await db.service.update({
    where: { id },
    data: { slug, ...serviceData(input), moderationStatus },
  });

  await afterCatalogWrite(sellerId, sellerSlug, "service", id);

  return {
    ok: true,
    id,
    slug,
    moderation: moderationStatus === "APPROVED" ? "APPROVED" : "PENDING",
    reason: rereview
      ? "Your changes are being reviewed before they appear publicly."
      : "Changes are live.",
  };
}

function serviceData(input: ServiceInput) {
  const currency = input.currency || "INR";

  return {
    name: input.name,
    categoryId: emptyToNull(input.categoryId),
    shortDescription: emptyToNull(input.shortDescription),
    description: emptyToNull(input.description),
    priceMinor: parseMoneyToMinor(input.price, currency) ?? null,
    currency,
    pricingModel: emptyToNull(input.pricingModel),
    priceOnRequest: input.priceOnRequest,
    serviceAreas: input.serviceAreas,
    imageUrl: emptyToNull(input.imageUrl),
    tags: input.tags,
    metaTitle: emptyToNull(input.metaTitle),
    metaDescription: emptyToNull(input.metaDescription),
    status: input.status,
  };
}

// ══════════════════════════ SHARED OPERATIONS ════════════════════════════════

/**
 * Publish or unpublish without opening the full editor.
 *
 * A separate operation rather than a field on the form: it changes what the
 * public sees, and it is the action a seller reaches for most often.
 */
export async function setCatalogStatus(
  sellerId: string,
  sellerSlug: string,
  kind: CatalogKind,
  id: string,
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED",
): Promise<boolean> {
  const tdb = forSeller(sellerId);

  // `updateMany` through the tenant client, so an id belonging to another
  // seller updates zero rows instead of throwing — and tells us so.
  const result =
    kind === "product"
      ? await tdb.product.updateMany({ where: { id, ...NOT_DELETED }, data: { status } })
      : await tdb.service.updateMany({ where: { id, ...NOT_DELETED }, data: { status } });

  if (result.count === 0) return false;

  await afterCatalogWrite(sellerId, sellerSlug, kind, id);
  return true;
}

/**
 * Soft delete.
 *
 * `deletedAt` rather than a real delete: enquiries reference products, and a
 * buyer's enquiry history should not develop holes because a seller tidied
 * their catalogue. Every read in this file filters `deletedAt: null`.
 */
export async function deleteCatalogItem(
  sellerId: string,
  sellerSlug: string,
  kind: CatalogKind,
  id: string,
): Promise<boolean> {
  const tdb = forSeller(sellerId);
  const deletedAt = new Date();

  const result =
    kind === "product"
      ? await tdb.product.updateMany({ where: { id, ...NOT_DELETED }, data: { deletedAt } })
      : await tdb.service.updateMany({ where: { id, ...NOT_DELETED }, data: { deletedAt } });

  if (result.count === 0) return false;

  await afterCatalogWrite(sellerId, sellerSlug, kind, id);
  return true;
}

/**
 * Everything that must happen after any catalogue write.
 *
 * Order matters. Indexability is recomputed and persisted FIRST, then the cache
 * is invalidated — the reverse order serves one request with the old robots
 * headers, which is precisely the request a crawler might make.
 */
async function afterCatalogWrite(
  sellerId: string,
  sellerSlug: string,
  kind: CatalogKind,
  id: string,
): Promise<void> {
  await recomputeIndexability(sellerId);

  if (kind === "product") revalidateProduct(sellerSlug, id);
  else revalidateService(sellerSlug, id);

  // Listings show product counts and latest products per city × category.
  await revalidateSellerDiscovery(sellerId);
}

/** Counts for the catalogue pages and the dashboard overview. */
export async function getCatalogCounts(sellerId: string) {
  const tdb = forSeller(sellerId);

  const [products, publishedProducts, services, publishedServices, awaitingReview] =
    await Promise.all([
      tdb.product.count({ where: NOT_DELETED }),
      tdb.product.count({
        where: { status: "PUBLISHED", moderationStatus: "APPROVED", ...NOT_DELETED },
      }),
      tdb.service.count({ where: NOT_DELETED }),
      tdb.service.count({
        where: { status: "PUBLISHED", moderationStatus: "APPROVED", ...NOT_DELETED },
      }),
      Promise.all([
        tdb.product.count({
          where: { moderationStatus: "PENDING", status: "PUBLISHED", ...NOT_DELETED },
        }),
        tdb.service.count({
          where: { moderationStatus: "PENDING", status: "PUBLISHED", ...NOT_DELETED },
        }),
      ]).then(([a, b]) => a + b),
    ]);

  return { products, publishedProducts, services, publishedServices, awaitingReview };
}

/**
 * Categories offered in the catalogue editors.
 *
 * Goes two levels deep, unlike onboarding (which stops at one): a seller
 * choosing a category for a single product wants the specific leaf, whereas
 * during registration they are describing the business in broad strokes.
 */
export async function getCategoryOptions() {
  // Ordered by materialised path so the flat <select> reads as a tree —
  // each subcategory directly under its group (D34: ~400 rows).
  return db.category.findMany({
    where: { isActive: true, depth: { lte: 2 } },
    select: { id: true, name: true, depth: true },
    orderBy: [{ path: "asc" }],
    take: 1000,
  });
}
