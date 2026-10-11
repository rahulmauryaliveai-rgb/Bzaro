import { SKU_MAX_LENGTH, SKU_PATTERN } from "@/lib/validation/catalog";

/**
 * Photo file name → which product, which position (D49).
 *
 * `LED-9W-CW.jpg`    → product LED-9W-CW, photo 1
 * `LED-9W-CW_1.jpg`  → product LED-9W-CW, photo 1
 * `LED-9W-CW_2.jpg`  → product LED-9W-CW, photo 2
 *
 * ── Why the underscore ─────────────────────────────────────────────────────
 * It is the one separator that survives every phone, camera, WhatsApp export
 * and Windows "copy (2)" rename, and it is excluded from the SKU character set
 * precisely so this split is unambiguous (see `SKU_PATTERN`). A hyphen could
 * not be used: hyphens are legal inside a SKU, so `LED-9W-2.jpg` would be
 * unresolvable between product `LED-9W-2` and photo 2 of `LED-9W`.
 *
 * ── Pure, and tested as such ───────────────────────────────────────────────
 * Takes the name and the seller's own SKU map. No database, no upload, no
 * request — the matching rules are the part that has to be right, and they are
 * testable from a list of strings.
 */

/** Matches the 12-image cap in `productImagesSchema`. */
export const MAX_PHOTOS_PER_PRODUCT = 12;

export const PHOTO_EXTENSIONS = ["jpg", "jpeg", "png", "webp"] as const;

export type PhotoName =
  | { ok: true; sku: string; position: number }
  | {
      ok: false;
      reason:
        /** Not an image we accept. */
        | "unsupported_type"
        /** The part before `_` is not a usable SKU. */
        | "bad_sku"
        /** `_0`, `_13`, `_abc`. */
        | "bad_position";
      detail: string;
    };

/**
 * Read a file name.
 *
 * Says nothing about whether the product exists — that needs the seller's
 * catalogue, and is `matchPhotos`' job. This function answers only "what is
 * this file name claiming?", which is why it can be unit-tested.
 */
export function parsePhotoName(fileName: string): PhotoName {
  // Any directory part is dropped: a folder upload gives
  // "photos/batch1/LED-9W-CW.jpg", and the folders are how the seller
  // organises their desktop, not part of the SKU.
  const base = fileName.split(/[\\/]/).pop() ?? fileName;

  const lastDot = base.lastIndexOf(".");
  if (lastDot <= 0) {
    return { ok: false, reason: "unsupported_type", detail: "the file name has no .jpg or .png" };
  }

  const extension = base.slice(lastDot + 1).toLowerCase();
  if (!PHOTO_EXTENSIONS.includes(extension as (typeof PHOTO_EXTENSIONS)[number])) {
    return { ok: false, reason: "unsupported_type", detail: `.${extension} is not JPG, PNG or WEBP` };
  }

  const stem = base.slice(0, lastDot).trim();

  // Split on the LAST underscore, so a seller who has used one inside the
  // product part gets a clear "bad SKU" rather than a silently wrong match.
  const separator = stem.lastIndexOf("_");

  const skuPart = separator > 0 ? stem.slice(0, separator) : stem;
  const positionPart = separator > 0 ? stem.slice(separator + 1) : "";

  if (!skuPart) return { ok: false, reason: "bad_sku", detail: "there is no product code in the name" };

  if (skuPart.length > SKU_MAX_LENGTH || !SKU_PATTERN.test(skuPart)) {
    return {
      ok: false,
      reason: "bad_sku",
      detail: `"${skuPart}" is not a product code (letters, numbers and hyphen only)`,
    };
  }

  // No suffix at all means the only photo, which is photo 1.
  if (positionPart === "") return { ok: true, sku: skuPart, position: 1 };

  if (!/^\d{1,2}$/.test(positionPart)) {
    return {
      ok: false,
      reason: "bad_position",
      detail: `"_${positionPart}" is not a photo number — use _1 to _${MAX_PHOTOS_PER_PRODUCT}`,
    };
  }

  const position = Number.parseInt(positionPart, 10);

  if (position < 1 || position > MAX_PHOTOS_PER_PRODUCT) {
    return {
      ok: false,
      reason: "bad_position",
      detail: `photo numbers run from 1 to ${MAX_PHOTOS_PER_PRODUCT}`,
    };
  }

  return { ok: true, sku: skuPart, position };
}

/** One of this seller's products, as photo matching needs it. */
export type PhotoTarget = {
  id: string;
  sku: string;
  name: string;
  /** How many photos it already has, for the 12-photo cap. */
  imageCount: number;
};

export type MatchedFile = {
  fileName: string;
  productId: string;
  productName: string;
  sku: string;
  position: number;
  /**
   * The row's final `sortOrder`, decided HERE and passed through to the attach.
   *
   * It cannot be computed at attach time. Three photos upload concurrently, so
   * an attach that counted the product's existing images would race the other
   * two and two photos would claim the same slot — leaving the gallery in an
   * order that depends on which upload happened to finish first, which is the
   * opposite of what naming a file `_1` is for.
   *
   * Deciding it once, before anything uploads, makes the order a property of
   * the file names rather than of the network.
   */
  sortOrder: number;
};

export type UnmatchedFile = {
  fileName: string;
  /** Shown next to the file, with a product dropdown beside it. */
  reason: string;
};

export type PhotoMatch = {
  /** Grouped by product, in file-name order within each. */
  products: Array<{
    productId: string;
    productName: string;
    sku: string;
    existingCount: number;
    files: MatchedFile[];
    /** Set when accepting all of these would pass the 12-photo cap. */
    overCapBy: number;
  }>;
  unmatched: UnmatchedFile[];
};

/**
 * Match a batch of file names against this seller's catalogue.
 *
 * ── "replace" is not applied here ──────────────────────────────────────────
 * The cap is reported against the CURRENT photo count, and whether the seller
 * chose "add to existing" or "replace" changes that count. Passing the mode in
 * keeps the arithmetic in one place: with "replace", existing photos are about
 * to be deleted, so they do not count against the cap.
 */
export function matchPhotos(input: {
  fileNames: readonly string[];
  products: readonly PhotoTarget[];
  mode: "add" | "replace";
}): PhotoMatch {
  const { fileNames, products, mode } = input;

  // Case-insensitive, mirroring the citext column: a seller whose camera
  // lower-cases file names still matches a SKU typed in capitals.
  const bySku = new Map(products.map((product) => [product.sku.trim().toLowerCase(), product]));

  const grouped = new Map<string, MatchedFile[]>();
  const unmatched: UnmatchedFile[] = [];

  for (const fileName of fileNames) {
    const parsed = parsePhotoName(fileName);

    if (!parsed.ok) {
      unmatched.push({ fileName, reason: parsed.detail });
      continue;
    }

    const product = bySku.get(parsed.sku.toLowerCase());

    if (!product) {
      unmatched.push({
        fileName,
        reason: `no product with code "${parsed.sku}"`,
      });
      continue;
    }

    const files = grouped.get(product.id);
    const entry: MatchedFile = {
      fileName,
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      position: parsed.position,
      // Filled in below, once the group is known and sorted.
      sortOrder: 0,
    };

    if (files) files.push(entry);
    else grouped.set(product.id, [entry]);
  }

  const byId = new Map(products.map((product) => [product.id, product]));

  const matched = [...grouped].map(([productId, files]) => {
    const product = byId.get(productId)!;
    const existingCount = mode === "replace" ? 0 : product.imageCount;

    // Sorted by the number the seller gave, so photo 1 is the main photo
    // regardless of the order the browser handed us the files.
    const sorted = files.sort((left, right) => left.position - right.position);

    // Replacing starts the gallery again from zero, so `_1` really is slot 0.
    // Adding lands after whatever is already there, so a second batch extends
    // the gallery instead of fighting the first batch for the main slot.
    for (const file of sorted) {
      file.sortOrder = existingCount + file.position - 1;
    }

    return {
      productId,
      productName: product.name,
      sku: product.sku,
      existingCount,
      files: sorted,
      overCapBy: Math.max(0, existingCount + files.length - MAX_PHOTOS_PER_PRODUCT),
    };
  });

  return {
    // Products in the order their first file appeared, so the screen matches
    // what the seller selected.
    products: matched,
    unmatched,
  };
}
