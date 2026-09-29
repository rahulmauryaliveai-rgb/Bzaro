/**
 * Blog drafts as plain text files (D45): a small front-matter header, then
 * the article body in the article markers (src/lib/text/rich.ts).
 *
 *   ---
 *   title: How to choose LED panel lights for an office
 *   slug: choose-led-panel-lights-office
 *   summary: One or two sentences for the listing and search snippet.
 *   categories: electronics, lighting
 *   seo_title: (optional)
 *   meta_description: (optional)
 *   cover_image: (optional, https://…)
 *   cover_alt: (optional)
 *   publish_on: (optional, YYYY-MM-DD — goes live that day at 09:00 IST)
 *   author: (optional, an author's slug, e.g. bzaro-editorial-team)
 *   ---
 *   ## First heading
 *
 *   Body text with [links](/category/electronics)…
 *
 * Used by Admin → Blog → Import (paste a draft Claude or anyone wrote) and by
 * the starter-guides seed. Pure: no database, no environment.
 */

export type ImportedDraft = {
  title: string;
  slug: string | null;
  excerpt: string | null;
  categorySlugs: string[];
  metaTitle: string | null;
  metaDescription: string | null;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  /** YYYY-MM-DD; the article goes live that day at 09:00 IST. */
  publishOn: string | null;
  authorSlug: string | null;
  body: string;
};

const KEYS = new Set([
  "title",
  "slug",
  "summary",
  "categories",
  "seo_title",
  "meta_description",
  "cover_image",
  "cover_alt",
  "publish_on",
  "author",
]);

export function parseDraftMarkdown(
  input: string,
): { ok: true; draft: ImportedDraft } | { ok: false; error: string } {
  const text = input.replace(/\r\n?/g, "\n").replace(/^﻿/, "").trim();
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return {
      ok: false,
      error: "Start with a --- header block (title, summary…) and close it with ---.",
    };
  }
  const fields: Record<string, string> = {};
  for (const line of match[1]!.split("\n")) {
    if (!line.trim()) continue;
    const colon = line.indexOf(":");
    if (colon === -1)
      return { ok: false, error: `Header line without a colon: "${line.slice(0, 40)}"` };
    const key = line.slice(0, colon).trim().toLowerCase();
    if (!KEYS.has(key)) return { ok: false, error: `Unknown header field "${key}"` };
    fields[key] = line
      .slice(colon + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  const title = fields.title?.trim();
  if (!title) return { ok: false, error: "The header needs a title." };
  const body = match[2]!.trim();
  if (body.length < 200) return { ok: false, error: "The article body is too short." };

  const optional = (value: string | undefined) => (value && value.trim() ? value.trim() : null);
  const publishOn = optional(fields.publish_on);
  if (publishOn && !/^\d{4}-\d{2}-\d{2}$/.test(publishOn)) {
    return { ok: false, error: "publish_on must be YYYY-MM-DD" };
  }
  return {
    ok: true,
    draft: {
      title,
      slug: optional(fields.slug)?.toLowerCase() ?? null,
      excerpt: optional(fields.summary),
      categorySlugs: (fields.categories ?? "")
        .split(",")
        .map((slug) => slug.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 10),
      metaTitle: optional(fields.seo_title),
      metaDescription: optional(fields.meta_description),
      coverImageUrl: optional(fields.cover_image),
      coverImageAlt: optional(fields.cover_alt),
      publishOn,
      authorSlug: optional(fields.author)?.toLowerCase() ?? null,
      body,
    },
  };
}
