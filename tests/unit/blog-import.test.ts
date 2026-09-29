import { describe, expect, it } from "vitest";
import { parseDraftMarkdown } from "@/lib/blog/markdown-import";

/** D45: drafts pasted into Admin → Blog → Import. */

const body = "## Start here\n\n" + "A useful sentence for buyers. ".repeat(10);

describe("parseDraftMarkdown", () => {
  it("reads the header and body", () => {
    const result = parseDraftMarkdown(
      `---\ntitle: Buying CCTV: a checklist\nslug: CCTV-Checklist\nsummary: What to ask.\ncategories: safety-security, Packaging\n---\n\n${body}`,
    );
    expect(result).toMatchObject({
      ok: true,
      draft: {
        title: "Buying CCTV: a checklist",
        slug: "cctv-checklist",
        excerpt: "What to ask.",
        categorySlugs: ["safety-security", "packaging"],
        metaTitle: null,
      },
    });
    if (result.ok) expect(result.draft.body.startsWith("## Start here")).toBe(true);
  });

  it("accepts Windows line endings", () => {
    expect(parseDraftMarkdown(`---\r\ntitle: T title\r\n---\r\n${body}`).ok).toBe(true);
  });

  it("rejects a missing header, unknown fields and thin bodies", () => {
    expect(parseDraftMarkdown(body).ok).toBe(false);
    expect(parseDraftMarkdown(`---\ntitle: T\nauthor: x\n---\n${body}`).ok).toBe(false);
    expect(parseDraftMarkdown(`---\ntitle: T\n---\nToo short.`).ok).toBe(false);
  });
});
