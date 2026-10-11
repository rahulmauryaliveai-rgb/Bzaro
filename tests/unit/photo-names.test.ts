import { describe, expect, it } from "vitest";
import {
  MAX_PHOTOS_PER_PRODUCT,
  matchPhotos,
  parsePhotoName,
  type PhotoTarget,
} from "@/lib/import/photo-names";

/**
 * Matching photo file names to products (D49).
 *
 * ── Why this is tested so closely ──────────────────────────────────────────
 * The seller's whole interaction with bulk photos is renaming files on their
 * desktop and selecting all of them. If the rules here are even slightly
 * surprising, the symptom is a photograph silently attached to the wrong
 * product — which nobody notices until a buyer sees a bucket on a bulb
 * listing. There is no error message for that, so the rules have to be
 * unambiguous and the ambiguous cases have to be refusals.
 */

describe("parsePhotoName", () => {
  it("reads a bare SKU as photo 1", () => {
    expect(parsePhotoName("LED-9W-CW.jpg")).toEqual({
      ok: true,
      sku: "LED-9W-CW",
      position: 1,
    });
  });

  it("reads an explicit position", () => {
    expect(parsePhotoName("LED-9W-CW_2.jpg")).toEqual({
      ok: true,
      sku: "LED-9W-CW",
      position: 2,
    });
  });

  it("treats _1 and no suffix as the same position", () => {
    const bare = parsePhotoName("LED-9W-CW.jpg");
    const explicit = parsePhotoName("LED-9W-CW_1.jpg");
    expect(bare).toEqual(explicit);
  });

  it("accepts every position up to the cap and refuses past it", () => {
    for (let position = 1; position <= MAX_PHOTOS_PER_PRODUCT; position += 1) {
      expect(parsePhotoName(`SKU-1_${position}.jpg`)).toEqual({
        ok: true,
        sku: "SKU-1",
        position,
      });
    }

    const over = parsePhotoName(`SKU-1_${MAX_PHOTOS_PER_PRODUCT + 1}.jpg`);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.reason).toBe("bad_position");
  });

  it("refuses _0, which is not a photo number anyone means", () => {
    const result = parsePhotoName("SKU-1_0.jpg");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad_position");
  });

  it("accepts the image types the upload flow accepts", () => {
    for (const extension of ["jpg", "JPG", "jpeg", "png", "PNG", "webp"]) {
      expect(parsePhotoName(`SKU-1.${extension}`).ok, extension).toBe(true);
    }
  });

  it("refuses anything that is not one of those", () => {
    for (const name of ["SKU-1.pdf", "SKU-1.gif", "SKU-1.heic", "SKU-1.xlsx", "SKU-1"]) {
      const result = parsePhotoName(name);
      expect(result.ok, name).toBe(false);
      if (!result.ok) expect(result.reason).toBe("unsupported_type");
    }
  });

  it("drops a folder path, so a whole-folder upload works", () => {
    // A folder selection reports "photos/batch1/LED-9W-CW_2.jpg"; the folders
    // are how the seller organises their desktop, not part of the code.
    expect(parsePhotoName("photos/batch1/LED-9W-CW_2.jpg")).toEqual({
      ok: true,
      sku: "LED-9W-CW",
      position: 2,
    });
    expect(parsePhotoName("photos\\batch1\\LED-9W-CW_2.jpg")).toEqual({
      ok: true,
      sku: "LED-9W-CW",
      position: 2,
    });
  });

  it("splits on the LAST underscore", () => {
    // "A_B_2.jpg" could be product "A_B" photo 2 or product "A" photo "B_2".
    // Neither is importable, because "A_B" is not a legal SKU — and saying so
    // is better than picking one.
    const result = parsePhotoName("LED_9W_2.jpg");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("bad_sku");
      expect(result.detail).toContain("LED_9W");
    }
  });

  it("keeps hyphens inside the SKU, which is why the separator is _", () => {
    // This is the case the character set exists for: with "-" as the
    // separator, "LED-9W-2.jpg" would be unresolvable between product
    // "LED-9W-2" and photo 2 of "LED-9W".
    expect(parsePhotoName("LED-9W-2.jpg")).toEqual({
      ok: true,
      sku: "LED-9W-2",
      position: 1,
    });
  });

  it("refuses a SKU with characters that cannot be a product code", () => {
    for (const name of ["LED 9W.jpg", "LED@9W.jpg", "बल्ब.jpg", ".jpg"]) {
      const result = parsePhotoName(name);
      expect(result.ok, name).toBe(false);
    }
  });

  it("refuses a SKU over the 60-character cap", () => {
    const result = parsePhotoName(`${"A".repeat(61)}.jpg`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad_sku");
  });
});

// ── Matching against a catalogue ────────────────────────────────────────────

const PRODUCTS: PhotoTarget[] = [
  { id: "product-bulb", sku: "LED-9W-CW", name: "9W LED Bulb Cool White", imageCount: 0 },
  { id: "product-panel", sku: "PNL-36W-22", name: "2x2 Ft LED Panel", imageCount: 10 },
  { id: "product-full", sku: "FULL-1", name: "Already Full", imageCount: 12 },
];

describe("matchPhotos", () => {
  it("groups matched files under their product, in photo order", () => {
    const result = matchPhotos({
      // Deliberately out of order: the browser hands files over in whatever
      // order the OS gave them, and photo 1 must still be the main photo.
      fileNames: ["LED-9W-CW_3.jpg", "LED-9W-CW.jpg", "LED-9W-CW_2.jpg"],
      products: PRODUCTS,
      mode: "add",
    });

    expect(result.unmatched).toEqual([]);
    expect(result.products).toHaveLength(1);

    const group = result.products[0]!;
    expect(group.productId).toBe("product-bulb");
    expect(group.files.map((file) => file.position)).toEqual([1, 2, 3]);
    expect(group.overCapBy).toBe(0);
  });

  it("matches a SKU whatever the case of the file name", () => {
    // A camera that lower-cases file names must still find the product.
    const result = matchPhotos({
      fileNames: ["led-9w-cw_2.jpg"],
      products: PRODUCTS,
      mode: "add",
    });

    expect(result.products[0]?.productId).toBe("product-bulb");
  });

  it("reports a file whose product does not exist, naming the code", () => {
    const result = matchPhotos({
      fileNames: ["NOT-A-PRODUCT.jpg"],
      products: PRODUCTS,
      mode: "add",
    });

    expect(result.products).toEqual([]);
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0]!.reason).toContain("NOT-A-PRODUCT");
  });

  it("reports an unreadable file name with the reason", () => {
    const result = matchPhotos({
      fileNames: ["holiday snap.heic", "LED-9W-CW_99.jpg"],
      products: PRODUCTS,
      mode: "add",
    });

    expect(result.unmatched).toHaveLength(2);
    expect(result.unmatched[0]!.reason).toContain("not JPG, PNG or WEBP");
    expect(result.unmatched[1]!.reason).toContain("photo numbers run from 1");
  });

  it("counts existing photos against the 12-photo cap", () => {
    // The panel already has 10. Four more would be 14.
    const result = matchPhotos({
      fileNames: ["PNL-36W-22_1.jpg", "PNL-36W-22_2.jpg", "PNL-36W-22_3.jpg", "PNL-36W-22_4.jpg"],
      products: PRODUCTS,
      mode: "add",
    });

    const group = result.products[0]!;
    expect(group.existingCount).toBe(10);
    expect(group.overCapBy).toBe(2);
  });

  it("ignores existing photos when the seller chose to replace them", () => {
    // They are about to be deleted, so they cannot occupy a slot.
    const result = matchPhotos({
      fileNames: ["PNL-36W-22_1.jpg", "PNL-36W-22_2.jpg", "PNL-36W-22_3.jpg", "PNL-36W-22_4.jpg"],
      products: PRODUCTS,
      mode: "replace",
    });

    const group = result.products[0]!;
    expect(group.existingCount).toBe(0);
    expect(group.overCapBy).toBe(0);
  });

  it("reports the overflow for a product that is already full", () => {
    const result = matchPhotos({
      fileNames: ["FULL-1_1.jpg"],
      products: PRODUCTS,
      mode: "add",
    });

    expect(result.products[0]!.overCapBy).toBe(1);
  });

  it("handles a mixed batch of several products and some rubbish", () => {
    const result = matchPhotos({
      fileNames: [
        "LED-9W-CW.jpg",
        "LED-9W-CW_2.jpg",
        "PNL-36W-22.jpg",
        "GHOST-1.jpg",
        "Thumbs.db",
      ],
      products: PRODUCTS,
      mode: "add",
    });

    expect(result.products.map((group) => group.sku)).toEqual(["LED-9W-CW", "PNL-36W-22"]);
    expect(result.products[0]!.files).toHaveLength(2);
    expect(result.unmatched.map((file) => file.fileName)).toEqual(["GHOST-1.jpg", "Thumbs.db"]);
  });

  it("returns nothing for an empty selection", () => {
    const result = matchPhotos({ fileNames: [], products: PRODUCTS, mode: "add" });
    expect(result.products).toEqual([]);
    expect(result.unmatched).toEqual([]);
  });

  it("never matches a product belonging to nobody in the list", () => {
    // The list passed in is already tenant-scoped, so this is the unit-level
    // half of the isolation guarantee: a SKU not in the list cannot match,
    // however plausible it looks. The server re-checks ownership on attach.
    const result = matchPhotos({
      fileNames: ["OTHER-SELLER-SKU.jpg"],
      products: PRODUCTS,
      mode: "add",
    });

    expect(result.products).toEqual([]);
    expect(result.unmatched).toHaveLength(1);
  });
});
