"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSeller } from "@/lib/auth/guards";
import {
  deleteCatalogItemSchema,
  productSchema,
  serviceSchema,
} from "@/lib/validation/catalog";
import {
  createProduct,
  createService,
  deleteCatalogItem,
  setCatalogStatus,
  updateProduct,
  updateService,
  type CatalogKind,
} from "@/server/services/catalog.service";
import { slugify } from "@/lib/utils/slug";

/**
 * Catalogue Server Actions.
 *
 * Every action calls `requireSeller()` first, which reads membership from the
 * database rather than the session token. The tenant is never taken from the
 * form — no action here accepts a sellerId, so supplying one cannot reach
 * another business's catalogue.
 *
 * Item ids ARE taken from the form, which is unavoidable. They are made safe by
 * the tenant client: every read and write filters on the scoped seller, so an
 * id belonging to someone else matches zero rows and is reported as "no longer
 * exists" rather than acted upon.
 */

export type CatalogActionState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  message?: string;
  /** Set when a save succeeded but the item is queued for review (D10). */
  awaitingReview?: boolean;
};

function fieldErrorsFrom(issues: Array<{ path: PropertyKey[]; message: string }>) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

/**
 * Parse the textarea formats the forms use.
 *
 * Tags and service areas are entered one per line or comma-separated, because
 * asking a seller to operate a tag widget on a phone is worse than letting them
 * type. Both separators are accepted since both are what people actually do.
 */
function readList(formData: FormData, key: string): string[] {
  const raw = String(formData.get(key) ?? "");
  return raw
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

/**
 * Specifications arrive as parallel `specKey[]` / `specValue[]` arrays.
 *
 * Rows where both sides are blank are dropped rather than rejected: the form
 * renders a few empty rows for convenience, and an untouched row is not an
 * error. A row with only one side filled IS an error, and validation says so.
 */
function readSpecifications(formData: FormData) {
  const keys = formData.getAll("specKey").map((value) => String(value).trim());
  const values = formData.getAll("specValue").map((value) => String(value).trim());

  const rows: Array<{ key: string; value: string }> = [];

  for (let index = 0; index < Math.max(keys.length, values.length); index += 1) {
    const key = keys[index] ?? "";
    const value = values[index] ?? "";
    if (!key && !value) continue;
    rows.push({ key, value });
  }

  return rows;
}

/**
 * Product images arrive as parallel arrays, one entry per row.
 *
 * A verified upload fills in the metadata columns; a pasted link leaves them
 * blank. Both are accepted — the row is kept if it has a URL at all.
 *
 * The metadata is NOT trusted because it came from a hidden input; it is
 * trusted because `confirmUploadAction` checked the provider's signature before
 * the client ever saw it. A caller who edits these fields by hand gets a row
 * with wrong dimensions on their own product page, which is not a security
 * boundary worth defending — the URL itself is the only field that matters, and
 * it is length-capped and shape-checked by the schema.
 */
function readImages(formData: FormData) {
  const read = (key: string) => formData.getAll(key).map((value) => String(value).trim());

  const urls = read("imageUrl");
  const alts = read("imageAlt");
  const publicIds = read("imagePublicId");
  const providers = read("imageProvider");
  const widths = read("imageWidth");
  const heights = read("imageHeight");
  const bytes = read("imageBytes");
  const mimeTypes = read("imageMimeType");

  const numeric = (value: string | undefined) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  };

  return urls
    .map((url, index) => ({
      url,
      alt: alts[index] ?? "",
      publicId: publicIds[index] ?? "",
      provider: providers[index] === "S3" ? ("S3" as const) : undefined,
      width: numeric(widths[index]),
      height: numeric(heights[index]),
      bytes: numeric(bytes[index]),
      mimeType: mimeTypes[index] ?? "",
    }))
    .filter((image) => image.url);
}

function productInputFrom(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const rawSlug = String(formData.get("slug") ?? "").trim();

  return {
    name,
    // An empty slug field is filled from the name rather than rejected. A
    // seller who never thinks about URLs still gets a sensible one.
    slug: rawSlug || slugify(name),
    categoryId: String(formData.get("categoryId") ?? ""),
    shortDescription: String(formData.get("shortDescription") ?? ""),
    description: String(formData.get("description") ?? ""),
    brand: String(formData.get("brand") ?? ""),
    sku: String(formData.get("sku") ?? ""),
    modelNumber: String(formData.get("modelNumber") ?? ""),
    price: String(formData.get("price") ?? ""),
    priceMax: String(formData.get("priceMax") ?? ""),
    currency: String(formData.get("currency") ?? "INR") || "INR",
    unit: String(formData.get("unit") ?? ""),
    minOrderQty: String(formData.get("minOrderQty") ?? ""),
    priceOnRequest: formData.get("priceOnRequest") === "on",
    specifications: readSpecifications(formData),
    tags: readList(formData, "tags"),
    images: readImages(formData),
    metaTitle: String(formData.get("metaTitle") ?? ""),
    metaDescription: String(formData.get("metaDescription") ?? ""),
    status: String(formData.get("status") ?? "DRAFT"),
  };
}

function serviceInputFrom(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const rawSlug = String(formData.get("slug") ?? "").trim();

  return {
    name,
    slug: rawSlug || slugify(name),
    categoryId: String(formData.get("categoryId") ?? ""),
    shortDescription: String(formData.get("shortDescription") ?? ""),
    description: String(formData.get("description") ?? ""),
    price: String(formData.get("price") ?? ""),
    currency: String(formData.get("currency") ?? "INR") || "INR",
    pricingModel: String(formData.get("pricingModel") ?? ""),
    priceOnRequest: formData.get("priceOnRequest") === "on",
    serviceAreas: readList(formData, "serviceAreas"),
    imageUrl: String(formData.get("imageUrl") ?? ""),
    tags: readList(formData, "tags"),
    metaTitle: String(formData.get("metaTitle") ?? ""),
    metaDescription: String(formData.get("metaDescription") ?? ""),
    status: String(formData.get("status") ?? "DRAFT"),
  };
}

/** Refresh every dashboard surface whose numbers a catalogue write changes. */
function revalidateCatalogSurfaces(kind: CatalogKind): void {
  revalidatePath("/dashboard");
  revalidatePath(kind === "product" ? "/dashboard/products" : "/dashboard/services");
}

// ══════════════════════════════ PRODUCTS ═════════════════════════════════════

export async function saveProductAction(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const scope = await requireSeller();

  const parsed = productSchema.safeParse(productInputFrom(formData));

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const id = String(formData.get("id") ?? "").trim();

  const result = id
    ? await updateProduct(scope.sellerId, scope.sellerSlug, id, parsed.data)
    : await createProduct(scope.sellerId, scope.sellerSlug, parsed.data);

  if (!result.ok) return { error: result.message };

  revalidateCatalogSurfaces("product");

  // Creating redirects into the editor for the new row, so the seller lands
  // somewhere they can keep working rather than on an empty form again.
  if (!id) redirect(`/dashboard/products/${result.id}?created=1`);

  return {
    ok: true,
    message: result.reason,
    awaitingReview: result.moderation === "PENDING",
  };
}

// ══════════════════════════════ SERVICES ═════════════════════════════════════

export async function saveServiceAction(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const scope = await requireSeller();

  const parsed = serviceSchema.safeParse(serviceInputFrom(formData));

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const id = String(formData.get("id") ?? "").trim();

  const result = id
    ? await updateService(scope.sellerId, scope.sellerSlug, id, parsed.data)
    : await createService(scope.sellerId, scope.sellerSlug, parsed.data);

  if (!result.ok) return { error: result.message };

  revalidateCatalogSurfaces("service");

  if (!id) redirect(`/dashboard/services/${result.id}?created=1`);

  return {
    ok: true,
    message: result.reason,
    awaitingReview: result.moderation === "PENDING",
  };
}

// ══════════════════════════ PUBLISH AND DELETE ═══════════════════════════════

/**
 * Publish or unpublish from the list, without opening the editor.
 *
 * Returns `void` and is used as a plain form action, so it works without
 * JavaScript — the whole dashboard does, and this is the control a seller uses
 * most often.
 */
export async function setCatalogStatusAction(formData: FormData): Promise<void> {
  const scope = await requireSeller();

  const kind = formData.get("kind") === "service" ? "service" : "product";
  const id = String(formData.get("id") ?? "").trim();
  const requested = String(formData.get("status") ?? "");

  const status =
    requested === "PUBLISHED" || requested === "DRAFT" || requested === "ARCHIVED"
      ? requested
      : null;

  if (!id || !status) return;

  await setCatalogStatus(scope.sellerId, scope.sellerSlug, kind, id, status);

  revalidateCatalogSurfaces(kind);
}

export async function deleteCatalogItemAction(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const scope = await requireSeller();

  const kind = formData.get("kind") === "service" ? "service" : "product";

  const parsed = deleteCatalogItemSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    confirm: String(formData.get("confirm") ?? ""),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const deleted = await deleteCatalogItem(
    scope.sellerId,
    scope.sellerSlug,
    kind,
    parsed.data.id,
  );

  if (!deleted) {
    return { error: "That item no longer exists." };
  }

  revalidateCatalogSurfaces(kind);
  redirect(kind === "service" ? "/dashboard/services?deleted=1" : "/dashboard/products?deleted=1");
}
