import { describe, expect, it } from "vitest";
import {
  businessDescriptor,
  categorySeoDescription,
  categorySeoTitle,
  clip,
  productSeoDescription,
  productSeoTitle,
  sellerSeoDescription,
  sellerSeoTitle,
} from "@/lib/seo/templates";
import { rollUp } from "@/lib/utils/tree";
import { sellerCanonicalUrl } from "@/lib/utils/url";

/** D44: marketplace titles, descriptions and the canonical rule. */

describe("clip", () => {
  it("leaves short text alone and cuts long text at a word", () => {
    expect(clip("  LED   bulbs ")).toBe("LED bulbs");
    const long = "word ".repeat(60);
    const out = clip(long, 50);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/wor…$/);
  });
});

describe("businessDescriptor", () => {
  it("only claims what the seller told us", () => {
    expect(businessDescriptor("MANUFACTURER", "LED Lights")).toBe("LED Lights manufacturer");
    expect(businessDescriptor("SERVICE_PROVIDER", "Printing")).toBe("Printing services");
    expect(businessDescriptor(null, "Printing")).toBe("Printing business");
    expect(businessDescriptor(null, null)).toBeNull();
  });
});

describe("seller templates", () => {
  const base = { businessName: "Aggarwal Printer", city: "Greater Noida" };
  it("builds a title from type, category and city", () => {
    expect(sellerSeoTitle({ ...base, businessType: "TRADER", categoryName: "Stationery" })).toBe(
      "Aggarwal Printer – Stationery trader in Greater Noida",
    );
  });
  it("never adds 'wholesale' or 'manufacturer' on its own", () => {
    const title = sellerSeoTitle({ ...base, categoryName: "Tuition & Coaching" });
    expect(title).not.toMatch(/wholesale|manufacturer/i);
  });
  it("drops the descriptor before the business name when too long", () => {
    const title = sellerSeoTitle({
      businessName: "Shree Balaji Industrial Packaging Solutions",
      businessType: "MANUFACTURER",
      categoryName: "Corrugated Boxes & Cartons",
      city: "Greater Noida",
    });
    expect(title.startsWith("Shree Balaji Industrial Packaging Solutions")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(62);
  });
  it("prefers the seller's own description", () => {
    const description =
      "**We print** school notebooks, registers and diaries for schools across NCR since 2004.";
    expect(sellerSeoDescription({ ...base, description })).toBe(
      "We print school notebooks, registers and diaries for schools across NCR since 2004.",
    );
  });
  it("falls back to a readable sentence", () => {
    expect(
      sellerSeoDescription({
        ...base,
        businessType: "TRADER",
        categoryName: "Stationery",
        productCount: 4,
      }),
    ).toBe(
      "Aggarwal Printer is a Stationery trader based in Greater Noida. See 4 products, business details and send an enquiry on Bzaro.",
    );
  });
});

describe("product templates", () => {
  const base = {
    name: "Customised School Notebooks",
    sellerName: "Aggarwal Printer",
    city: "Greater Noida",
  };
  it("uses the seller's meta title when set", () => {
    expect(productSeoTitle({ ...base, metaTitle: " Notebooks for schools " })).toBe(
      "Notebooks for schools",
    );
    expect(productSeoTitle(base)).toBe(
      "Customised School Notebooks – Aggarwal Printer, Greater Noida",
    );
  });
  it("ignores a short description that just repeats the name", () => {
    const text = productSeoDescription({
      ...base,
      shortDescription: "Customised School Notebooks",
      priceLabel: "Price on request",
      minOrderLabel: "500 pieces",
    });
    expect(text).toBe(
      "Customised School Notebooks from Aggarwal Printer in Greater Noida. Price on request. Minimum order 500 pieces. Send an enquiry on Bzaro to get a quote.",
    );
  });
});

describe("category templates", () => {
  it("keeps the category name as written and lists cities", () => {
    expect(categorySeoTitle({ name: "LED Lights" })).toBe(
      "LED Lights – suppliers & products in India",
    );
    expect(
      categorySeoDescription({ name: "LED Lights", productCount: 12, cities: ["Noida", "Delhi"] }),
    ).toBe(
      "Compare 12 LED Lights products from verified suppliers in Noida and Delhi. Check prices and send one enquiry to get quotes.",
    );
  });
  it("uses the admin's override", () => {
    expect(categorySeoTitle({ name: "Lighting", metaTitle: "Lighting suppliers" })).toBe(
      "Lighting suppliers",
    );
  });
});

describe("rollUp", () => {
  it("adds a child's count to every ancestor", () => {
    const nodes = [
      { id: "root", ancestorIds: [] },
      { id: "mid", ancestorIds: ["root"] },
      { id: "leaf", ancestorIds: ["root", "mid"] },
    ];
    const totals = rollUp(nodes, [
      { id: "leaf", count: 3 },
      { id: "mid", count: 1 },
    ]);
    expect(totals.get("root")).toBe(4);
    expect(totals.get("mid")).toBe(4);
    expect(totals.get("leaf")).toBe(3);
  });
});

describe("sellerCanonicalUrl", () => {
  const seller = { slug: "aggarwal-printer", webPresence: "SUBDOMAIN" as const };
  it("keeps the marketplace page canonical while the site is blocked", () => {
    expect(sellerCanonicalUrl(seller, false, "/products/notebooks")).toMatch(
      /\/product\/aggarwal-printer\/notebooks$/,
    );
  });
  it("points at the site once it is indexable", () => {
    expect(sellerCanonicalUrl(seller, true, "/products/notebooks")).toMatch(
      /aggarwal-printer\.[^/]+\/products\/notebooks$/,
    );
  });
  it("is always the marketplace page for a Free seller", () => {
    expect(sellerCanonicalUrl({ ...seller, webPresence: "CATALOGUE" }, true)).toMatch(
      /\/seller\/aggarwal-printer$/,
    );
  });
});
