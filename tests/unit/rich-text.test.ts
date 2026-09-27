import { describe, expect, it } from "vitest";
import { parseInline, parseRich, stripRich } from "@/lib/text/rich";

/**
 * Seller "About us" formatting. Stored as plain text with markers; rendered
 * as React elements. The cases that matter: the markers sellers use, text
 * that merely looks like markers, and plain old descriptions.
 */

describe("parseInline", () => {
  it("reads bold, italic and underline", () => {
    expect(parseInline("a **b** *c* __d__")).toEqual([
      { type: "text", text: "a " },
      { type: "bold", children: [{ type: "text", text: "b" }] },
      { type: "text", text: " " },
      { type: "italic", children: [{ type: "text", text: "c" }] },
      { type: "text", text: " " },
      { type: "underline", children: [{ type: "text", text: "d" }] },
    ]);
  });

  it("nests one marker inside another", () => {
    expect(parseInline("**bold __and underlined__**")).toEqual([
      {
        type: "bold",
        children: [
          { type: "text", text: "bold " },
          { type: "underline", children: [{ type: "text", text: "and underlined" }] },
        ],
      },
    ]);
  });

  it("leaves lone or empty markers as text", () => {
    expect(parseInline("2*3 = 6")).toEqual([{ type: "text", text: "2*3 = 6" }]);
    expect(parseInline("**** done")).toEqual([{ type: "text", text: "**** done" }]);
  });

  it("never turns angle brackets into markup", () => {
    expect(parseInline("<b>hi</b>")).toEqual([{ type: "text", text: "<b>hi</b>" }]);
  });
});

describe("parseRich", () => {
  it("splits paragraphs, bullet lists and numbered lists", () => {
    const blocks = parseRich("Intro line\nsecond line\n\n- one\n- **two**\n\n1. first\n2) second");
    expect(blocks.map((b) => b.type)).toEqual(["paragraph", "bullets", "numbers"]);
    expect(blocks[1]).toMatchObject({
      type: "bullets",
      items: [[{ text: "one" }], [{ type: "bold" }]],
    });
    expect(blocks[2]).toMatchObject({ type: "numbers" });
    if (blocks[2]?.type === "numbers") expect(blocks[2].items).toHaveLength(2);
  });

  it("keeps an old plain description as paragraphs", () => {
    expect(parseRich("We make bulbs.\n\nSince 1998.")).toHaveLength(2);
  });

  it("handles empty input", () => {
    expect(parseRich(null)).toEqual([]);
    expect(parseRich("")).toEqual([]);
  });
});

describe("stripRich", () => {
  it("removes markers for excerpts and length rules", () => {
    expect(stripRich("We make **LED** *bulbs*.\n\n- ISO\n- BIS")).toBe(
      "We make LED bulbs.\n\nISO · BIS",
    );
  });
});
