import { parseDraftMarkdown, type ImportedDraft } from "@/lib/blog/markdown-import";
import { safeHref, wordCount } from "@/lib/text/rich";

/**
 * The pure half of the blog autopilot (D47): the brief sent to the model and
 * the checks its answer must pass before it goes live. No network, no DB.
 */

export const AUTOPILOT_SYSTEM = `You write practical buying guides for Bzaro (bzaro.in), an Indian B2B marketplace where business buyers find verified suppliers, manufacturers, wholesalers and service providers, strongest in Delhi NCR.

Write for real Indian business buyers first and search engines second:
- Natural Indian English, specific and useful. No keyword stuffing. No filler openings ("In today's fast-paced world"). No "best", "#1", "cheapest" or "leading" claims. No invented statistics, prices, testimonials, brands or supplier names. Do not state prices, subsidy amounts or legal thresholds; tell the reader what to ask the supplier instead.
- Never copy wording from IndiaMART, TradeIndia, Amazon, Flipkart or any other site.
- 800–1,100 words. A short opening paragraph on why the decision matters, then 4–7 sections, each starting with a line "## Heading" phrased as the buyer's question or decision, bullets or numbered checklists where they help, and a final section on what to include in an enquiry or requirement.
- Formatting allowed: **bold**, *italic*, lines starting "- " or "1. ", "## " and "### " headings, and links written as [text](/path). Use 2–3 links, only to these paths: /category/<slug> (the given category slugs), /post-requirement, /sellers, /blog. No other links, no HTML, no tables, no images.
- End with one sentence inviting the reader to browse the category or post a requirement.

Reply with ONLY the article in exactly this format, nothing before or after:
---
title: <clear title, at most 65 characters>
slug: <lower-case-hyphenated-slug>
summary: <1–2 sentences, at most 250 characters>
categories: <the given category slugs, comma-separated>
meta_description: <at most 155 characters, a sentence a person would click>
cover_alt: <description of a suitable cover photo>
---

<article body>`;

export function autopilotUserPrompt(
  topic: { title: string; categories: string[] },
  existingTitles: string[],
): string {
  const avoid = existingTitles.length
    ? `\n\nAlready published on the blog — do not repeat these topics or their titles:\n${existingTitles
        .slice(0, 80)
        .map((title) => `- ${title}`)
        .join("\n")}`
    : "";
  return `Topic: ${topic.title}\nCategory slugs: ${topic.categories.join(", ")}${avoid}`;
}

const LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
const ALLOWED_PREFIXES = ["/category/", "/post-requirement", "/sellers", "/blog"];

/**
 * Keep only links to allowed Bzaro paths; anything else keeps its text and
 * loses the link. Drops leftover reviewer notes in square brackets.
 */
export function sanitiseBody(body: string): string {
  return body
    .replace(LINK, (match, text: string, href: string) => {
      const safe = safeHref(href);
      return safe && ALLOWED_PREFIXES.some((prefix) => safe.startsWith(prefix)) ? match : text;
    })
    .replace(/\[(?:rahul|todo|note|editor)\b[^\]]*\]\s*/gi, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

const RED_FLAGS = [
  /\bin today'?s fast[- ]paced\b/i,
  // "#1 supplier", but not a "## 1." numbered heading
  /(?<![#\w])#\s?1\b(?!\.)/,
  /\bbest (?:supplier|manufacturer|price|quality) in india\b/i,
  /\bcheapest\b/i,
  /\bleading (?:supplier|manufacturer)\b/i,
  /\bas an ai\b/i,
];

export type AutopilotCheck =
  | { ok: true; draft: ImportedDraft; publish: boolean; notes: string[] }
  | { ok: false; error: string };

/**
 * Parse and check the model's answer. `publish: false` means "usable, but
 * save as a draft for a human" — a red-flag phrase, or thin structure.
 */
export function checkGeneratedArticle(raw: string): AutopilotCheck {
  const trimmed = raw.trim().replace(/^```(?:markdown|md)?\n([\s\S]*?)\n```$/, "$1");
  const parsed = parseDraftMarkdown(trimmed);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const body = sanitiseBody(parsed.draft.body);
  const draft = { ...parsed.draft, body };

  const notes: string[] = [];
  const words = wordCount(body, { article: true });
  const headings = body.split("\n").filter((line) => /^##\s+\S/.test(line)).length;
  if (words < 550) notes.push(`only ${words} words`);
  if (words > 1800) notes.push(`${words} words — unusually long`);
  if (headings < 3) notes.push(`only ${headings} section headings`);
  if (draft.title.length > 90) notes.push("title too long");
  for (const flag of RED_FLAGS) {
    if (flag.test(body) || flag.test(draft.title)) notes.push(`phrase not allowed: ${flag.source}`);
  }
  return { ok: true, draft, publish: notes.length === 0, notes };
}
