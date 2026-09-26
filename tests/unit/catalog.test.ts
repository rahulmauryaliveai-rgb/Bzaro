import { describe, expect, it } from "vitest";
import { checkCatalogSlug, slugify, uniqueSlug } from "@/lib/utils/slug";
import { minorToMajorString, parseMoneyToMinor } from "@/lib/utils/money";
import {
  productSchema,
  serviceSchema,
  specificationsSchema,
  tagsSchema,
} from "@/lib/validation/catalog";
import { decideModeration, editRequiresRereview } from "@/lib/validation/moderation";

/**
 * Catalogue rules.
 *
 * The money and moderation cases carry the most weight: one decides what a
 * buyer is quoted, the other decides what reaches the public without review.
 */

describe("slugify", () => {
  it("turns a product name into a usable address", () => {
    expect(slugify("LED Panel 40W")).toBe("led-panel-40w");
    expect(slugify("  Spaced   Out  ")).toBe("spaced-out");
  });

  it("folds diacritics rather than dropping the character", () => {
    // Dropping would give "amb-dkar"; folding keeps the word readable.
    expect(slugify("Ambédkar Materials")).toBe("ambedkar-materials");
  });

  it("never produces a leading or trailing hyphen", () => {
    expect(slugify("!!! Special !!!")).toBe("special");
    expect(slugify("—")).toBe("");
  });
});

describe("checkCatalogSlug", () => {
  it("accepts an ordinary slug", () => {
    expect(checkCatalogSlug("led-panel-40w").ok).toBe(true);
  });

  it("rejects characters that would not survive a URL", () => {
    for (const bad of ["LED Panel", "led_panel", "led/panel", "led.panel", "led–panel"]) {
      expect(checkCatalogSlug(bad).ok, `${bad} should be rejected`).toBe(false);
    }
  });

  it("rejects segments the dashboard routes would shadow", () => {
    // /dashboard/products/new is the create route, so a product slugged "new"
    // would be unreachable in the editor.
    expect(checkCatalogSlug("new").ok).toBe(false);
    expect(checkCatalogSlug("edit").ok).toBe(false);
  });

  it("allows a longer slug than a subdomain would", () => {
    // Path segments are not DNS labels; the 63-character limit does not apply.
    expect(checkCatalogSlug("a".repeat(70)).ok).toBe(true);
    expect(checkCatalogSlug("a".repeat(81)).ok).toBe(false);
  });
});

describe("uniqueSlug", () => {
  it("leaves a free slug alone", () => {
    expect(uniqueSlug("led-panel", ["other"])).toBe("led-panel");
  });

  it("appends a readable counter on collision", () => {
    expect(uniqueSlug("led-panel", ["led-panel"])).toBe("led-panel-2");
    expect(uniqueSlug("led-panel", ["led-panel", "led-panel-2"])).toBe("led-panel-3");
  });

  it("ignores case when deciding what is taken", () => {
    expect(uniqueSlug("led-panel", ["LED-PANEL"])).toBe("led-panel-2");
  });
});

describe("parseMoneyToMinor", () => {
  it("converts rupees to paise", () => {
    expect(parseMoneyToMinor("1250")).toBe(125000);
    expect(parseMoneyToMinor("1250.50")).toBe(125050);
  });

  it("tolerates how people actually type money", () => {
    expect(parseMoneyToMinor("₹1,250")).toBe(125000);
    expect(parseMoneyToMinor(" 1250 ")).toBe(125000);
  });

  it("rounds rather than truncating", () => {
    // Truncation loses money in the seller's disfavour on every edit.
    expect(parseMoneyToMinor("10.005")).toBe(1001);
  });

  it("distinguishes blank from nonsense", () => {
    // Blank means "no price"; nonsense must be reportable as an error rather
    // than silently clearing a price the seller had set.
    expect(parseMoneyToMinor("")).toBe(null);
    expect(parseMoneyToMinor(null)).toBe(null);
    expect(parseMoneyToMinor("call me")).toBe(undefined);
  });

  it("round-trips through the edit form", () => {
    expect(minorToMajorString(125000)).toBe("1250");
    expect(minorToMajorString(125050)).toBe("1250.50");
    expect(minorToMajorString(null)).toBe("");
  });
});

describe("tagsSchema", () => {
  it("lowercases and de-duplicates", () => {
    // Otherwise "LED" and "led" fragment the marketplace facet counts.
    const result = tagsSchema.parse(["LED", "led", " LED ", "panel"]);
    expect(result).toEqual(["led", "panel"]);
  });
});

describe("specificationsSchema", () => {
  it("rejects a row with only one side filled", () => {
    expect(specificationsSchema.safeParse([{ key: "Wattage", value: "" }]).success).toBe(false);
  });

  it("caps the number of rows", () => {
    const rows = Array.from({ length: 31 }, () => ({ key: "k", value: "v" }));
    expect(specificationsSchema.safeParse(rows).success).toBe(false);
  });
});

describe("productSchema", () => {
  const VALID = { name: "LED Panel 40W", slug: "led-panel-40w" };

  it("accepts a product with nothing but a name and address", () => {
    // A seller must be able to write down a product now and price it later.
    expect(productSchema.safeParse(VALID).success).toBe(true);
  });

  it("rejects a price that is not a number", () => {
    expect(productSchema.safeParse({ ...VALID, price: "call us" }).success).toBe(false);
  });

  it("caps the description", () => {
    expect(productSchema.safeParse({ ...VALID, description: "x".repeat(5001) }).success).toBe(
      false,
    );
  });

  it("requires images to be full URLs", () => {
    const result = productSchema.safeParse({
      ...VALID,
      images: [{ url: "not-a-url", alt: "" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a protocol-relative image URL", () => {
    // Regression. `//evil.example.com/x.jpg` begins with a slash, so the
    // original "starts with /" check read it as a local path — but a browser
    // resolves it to that external host. The same mistake was present in the
    // profile and gallery schemas; all three now share one rule.
    const result = productSchema.safeParse({
      ...VALID,
      images: [{ url: "//evil.example.com/x.jpg", alt: "" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an executable scheme in an image URL", () => {
    for (const url of ["javascript:alert(1)", "data:text/html;base64,PHN2Zz4="]) {
      const result = productSchema.safeParse({ ...VALID, images: [{ url, alt: "" }] });
      expect(result.success, `${url} should be rejected`).toBe(false);
    }
  });
});

describe("serviceSchema", () => {
  it("accepts a minimal service", () => {
    expect(serviceSchema.safeParse({ name: "Installation", slug: "installation" }).success).toBe(
      true,
    );
  });

  it("constrains the pricing model to known values", () => {
    const result = serviceSchema.safeParse({
      name: "Installation",
      slug: "installation",
      pricingModel: "whatever",
    });
    expect(result.success).toBe(false);
  });
});

describe("decideModeration", () => {
  const VERIFIED = {
    sellerStatus: "VERIFIED",
    approvedItems: 0,
    rejectedItems: 0,
    flaggedItems: 0,
  };

  it("publishes a verified seller's content immediately, even the first listing (D38)", () => {
    expect(decideModeration(VERIFIED).status).toBe("APPROVED");
    expect(decideModeration({ ...VERIFIED, rejectedItems: 2, flaggedItems: 1 }).status).toBe(
      "APPROVED",
    );
  });

  it("holds content until the business itself is verified", () => {
    for (const sellerStatus of ["PENDING_VERIFICATION", "DRAFT", "SUSPENDED"]) {
      expect(decideModeration({ ...VERIFIED, sellerStatus }).status).toBe("PENDING");
    }
  });

  it("always explains itself", () => {
    expect(decideModeration({ ...VERIFIED, sellerStatus: "DRAFT" }).reason.length).toBeGreaterThan(10);
  });
});

describe("editRequiresRereview", () => {
  const VERIFIED = { sellerStatus: "VERIFIED", approvedItems: 0, rejectedItems: 0, flaggedItems: 0 };

  it("keeps a verified seller's content live through edits", () => {
    expect(editRequiresRereview(VERIFIED, "APPROVED")).toBe(false);
  });

  it("returns content to review once the seller is no longer verified", () => {
    expect(editRequiresRereview({ ...VERIFIED, sellerStatus: "SUSPENDED" }, "APPROVED")).toBe(true);
  });

  it("does not re-review content that was never approved", () => {
    expect(editRequiresRereview(VERIFIED, "PENDING")).toBe(false);
    expect(editRequiresRereview(VERIFIED, "REJECTED")).toBe(false);
  });
});
