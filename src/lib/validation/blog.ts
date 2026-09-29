import { z } from "zod";

/**
 * Blog article and author input (D45). Arrives as FormData from the admin
 * editor; ids for tagged listings are resolved server-side from the pasted
 * references, never trusted from the client.
 */

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value));

const httpsUrl = (max = 500) =>
  optional(max).refine(
    (value) => value === null || /^https:\/\/\S+$/.test(value),
    "Must be an https:// URL",
  );

/** Cover images may also be our own uploads ("/uploads/…"). */
const imageUrl = optional(500).refine(
  (value) => value === null || /^(https:\/\/\S+|\/uploads\/\S+)$/.test(value),
  "Image must be an https:// URL or an /uploads/ path",
);

export const BLOG_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const blogPostSchema = z.object({
  id: optional(40),
  title: z.string().trim().min(5, "Title is too short").max(140),
  slug: optional(100).refine(
    (value) => value === null || BLOG_SLUG.test(value),
    "Slug: lower-case letters, numbers and hyphens",
  ),
  excerpt: optional(300),
  body: z.string().trim().min(200, "The article is too short to publish usefully").max(60_000),
  coverImageUrl: imageUrl,
  coverImageAlt: optional(200),
  authorId: optional(40),
  metaTitle: optional(70),
  metaDescription: optional(170),
  ogImageUrl: httpsUrl(),
  canonicalUrl: httpsUrl(),
  noindex: z.boolean(),
  categoryIds: z.array(z.string().min(1).max(40)).max(10),
  productRefs: z.string().max(4000),
  sellerRefs: z.string().max(2000),
  /** YYYY-MM-DD; blank = now on first publish. */
  publishedOn: optional(10).refine(
    (value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value),
    "Date must be YYYY-MM-DD",
  ),
  intent: z.enum(["draft", "publish", "unpublish"]),
});

export type BlogPostInput = z.infer<typeof blogPostSchema>;

export const blogAuthorSchema = z.object({
  id: optional(40),
  name: z.string().trim().min(2).max(80),
  role: optional(80),
  bio: optional(1000),
  avatarUrl: imageUrl,
  linkedinUrl: httpsUrl(),
});

/**
 * "https://bzaro.in/product/abc-co/led-panel", "/product/abc-co/led-panel"
 * or "abc-co/led-panel" → { seller: "abc-co", slug: "led-panel" }.
 */
export function parseProductRef(line: string): { seller: string; slug: string } | null {
  const value = line
    .trim()
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");
  if (!value) return null;
  const market = value.match(/\/product\/([a-z0-9-]+)\/([a-z0-9-]+)$/i);
  if (market) return { seller: market[1]!.toLowerCase(), slug: market[2]!.toLowerCase() };
  const site = value.match(/^https?:\/\/([a-z0-9-]+)\.[^/]+\/products\/([a-z0-9-]+)$/i);
  if (site) return { seller: site[1]!.toLowerCase(), slug: site[2]!.toLowerCase() };
  const bare = value.match(/^([a-z0-9-]+)\/([a-z0-9-]+)$/i);
  if (bare) return { seller: bare[1]!.toLowerCase(), slug: bare[2]!.toLowerCase() };
  return null;
}

/** "https://bzaro.in/seller/abc-co", "https://abc-co.bzaro.in" or "abc-co" → "abc-co". */
export function parseSellerRef(line: string): string | null {
  const value = line
    .trim()
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");
  if (!value) return null;
  const market = value.match(/\/seller\/([a-z0-9-]+)$/i);
  if (market) return market[1]!.toLowerCase();
  const site = value.match(/^https?:\/\/([a-z0-9-]+)\.[a-z0-9.-]+$/i);
  if (site && site[1]!.toLowerCase() !== "www") return site[1]!.toLowerCase();
  if (/^[a-z0-9-]+$/i.test(value)) return value.toLowerCase();
  return null;
}

/** Split a textarea of references on newlines and commas. */
export function splitRefs(input: string): string[] {
  return [
    ...new Set(
      input
        .split(/[\n,]/)
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ].slice(0, 30);
}

/** Reading time at ~200 words a minute, never "0 min". */
export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 200));
}
