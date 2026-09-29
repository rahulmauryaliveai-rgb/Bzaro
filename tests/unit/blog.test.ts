import { describe, expect, it } from "vitest";
import { parseRich, safeHref, stripRich } from "@/lib/text/rich";
import { parseProductRef, parseSellerRef, readingMinutes, splitRefs } from "@/lib/validation/blog";

/** D45: article markers and the admin's pasted references. */

describe("article markers", () => {
  const doc =
    "## Why MOQ matters\n\nSee [lighting suppliers](/category/electronics/lighting).\n\n## Why MOQ matters";

  it("parses headings with unique anchors and links", () => {
    const blocks = parseRich(doc, { article: true });
    expect(blocks[0]).toMatchObject({ type: "heading", level: 2, id: "why-moq-matters" });
    expect(blocks[2]).toMatchObject({ type: "heading", id: "why-moq-matters-2" });
    expect(blocks[1]).toMatchObject({
      type: "paragraph",
      children: [
        { type: "text", text: "See " },
        { type: "link", href: "/category/electronics/lighting" },
        { type: "text", text: "." },
      ],
    });
  });

  it("never gives seller text headings or links", () => {
    const blocks = parseRich("## Title\n\n[x](/a)");
    expect(blocks.every((block) => block.type === "paragraph")).toBe(true);
    expect(stripRich("[x](/a)")).toBe("[x](/a)");
  });

  it("rejects unsafe link targets", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("//evil.example")).toBeNull();
    expect(safeHref("http://plain.example")).toBeNull();
    expect(safeHref("/blog/a#b")).toBe("/blog/a#b");
    expect(safeHref("https://bzaro.in/x?y=1")).toBe("https://bzaro.in/x?y=1");
    const blocks = parseRich("[bad](javascript:alert(1))", { article: true });
    expect(blocks[0]).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", text: "[bad](javascript:alert(1))" }],
    });
  });

  it("strips to plain text for descriptions", () => {
    expect(stripRich(doc, { article: true })).toBe(
      "Why MOQ matters\n\nSee lighting suppliers.\n\nWhy MOQ matters",
    );
  });
});

describe("pasted references", () => {
  it("reads product links in every form", () => {
    expect(parseProductRef("https://bzaro.in/product/abc-co/led-panel?ref=x")).toEqual({
      seller: "abc-co",
      slug: "led-panel",
    });
    expect(parseProductRef("https://abc-co.bzaro.in/products/led-panel/")).toEqual({
      seller: "abc-co",
      slug: "led-panel",
    });
    expect(parseProductRef("abc-co/led-panel")).toEqual({ seller: "abc-co", slug: "led-panel" });
    expect(parseProductRef("not a link")).toBeNull();
  });

  it("reads supplier links and slugs", () => {
    expect(parseSellerRef("https://bzaro.in/seller/abc-co")).toBe("abc-co");
    expect(parseSellerRef("https://abc-co.bzaro.in")).toBe("abc-co");
    expect(parseSellerRef("https://www.bzaro.in")).toBeNull();
    expect(parseSellerRef("ABC-Co")).toBe("abc-co");
  });

  it("splits on commas and lines, without duplicates", () => {
    expect(splitRefs("a, b\nb\n\n c ")).toEqual(["a", "b", "c"]);
  });

  it("never says 0 minutes", () => {
    expect(readingMinutes(0)).toBe(1);
    expect(readingMinutes(1000)).toBe(5);
  });
});
