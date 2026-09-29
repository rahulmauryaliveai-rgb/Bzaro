/**
 * Formatted "About us" text (seller request, 2026-09).
 *
 * Sellers format with a toolbar; what is STORED is plain text with a few
 * markers — never HTML:
 *
 *   **bold**   *italic*   __underline__
 *   - bullet item          (a line starting "- " or "• ")
 *   1. numbered item       (a line starting "1. ", "2) " …)
 *   a blank line starts a new paragraph; a single newline is a line break
 *
 * Rendering builds React elements from this parse (src/components/shared/
 * RichText.tsx), so there is nothing to sanitise and no dangerouslySetInnerHTML
 * — a seller typing "<script>" just sees the text "<script>". Anything that is
 * not a recognised marker is shown literally. Old descriptions (plain text)
 * render exactly as before.
 *
 * Articles (the blog, D45) switch on two more markers with `{ article: true }`:
 *
 *   ## Heading / ### Sub-heading      (a line of its own)
 *   [link text](/category/lighting)   (site paths, or https:// URLs)
 *
 * Seller text never gets them: a link in a seller's About would be a spam
 * vector on a domain every seller shares.
 */

export type RichOptions = { article?: boolean };

export type Inline =
  | { type: "text"; text: string }
  | { type: "bold" | "italic" | "underline"; children: Inline[] }
  | { type: "link"; href: string; children: Inline[] }
  | { type: "break" };

export type Block =
  | { type: "paragraph"; children: Inline[] }
  | { type: "heading"; level: 2 | 3; id: string; children: Inline[] }
  | { type: "bullets"; items: Inline[][] }
  | { type: "numbers"; items: Inline[][] };

const BULLET = /^\s*(?:[-•*])\s+(.*)$/;
const HEADING = /^\s*(#{2,3})\s+(.*)$/;
const NUMBER = /^\s*\d{1,3}[.)]\s+(.*)$/;

// Order matters: "**" and "__" before the single-character "*".
const MARKERS: Array<{ open: string; type: "bold" | "italic" | "underline" }> = [
  { open: "**", type: "bold" },
  { open: "__", type: "underline" },
  { open: "*", type: "italic" },
];

/** Inline markers → a small tree. Unmatched markers stay as text. */
/**
 * A link target an article may use: a site path ("/category/x", "/blog/y#z")
 * or an absolute https URL. Anything else — javascript:, data:, http:,
 * protocol-relative "//evil" — is rejected and the text shows literally.
 */
export function safeHref(href: string): string | null {
  const value = href.trim();
  if (/^\/(?!\/)[^\s<>"]*$/.test(value)) return value;
  if (/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(?:[/?#][^\s<>"]*)?$/i.test(value)) return value;
  return null;
}

/** "Why MOQ matters?" → "why-moq-matters" — heading anchors. */
export function headingId(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "section"
  );
}

export function parseInline(input: string, depth = 0, options: RichOptions = {}): Inline[] {
  const out: Inline[] = [];
  let text = "";
  let i = 0;
  const flush = () => {
    if (text) out.push({ type: "text", text });
    text = "";
  };

  while (i < input.length) {
    if (input[i] === "\n") {
      flush();
      out.push({ type: "break" });
      i += 1;
      continue;
    }
    let matched = false;
    if (options.article && depth < 4 && input[i] === "[") {
      const mid = input.indexOf("](", i + 1);
      const end = mid === -1 ? -1 : input.indexOf(")", mid + 2);
      const label = mid === -1 ? "" : input.slice(i + 1, mid);
      const href = end === -1 ? null : safeHref(input.slice(mid + 2, end));
      if (href && label.trim().length > 0 && !label.includes("\n")) {
        flush();
        // No links inside links; other markers are fine.
        out.push({ type: "link", href, children: parseInline(label, depth + 1, {}) });
        i = end + 1;
        continue;
      }
    }
    if (depth < 4) {
      for (const marker of MARKERS) {
        if (!input.startsWith(marker.open, i)) continue;
        const close = input.indexOf(marker.open, i + marker.open.length);
        // Needs content, and "*" must not be the start of "**".
        if (close > i + marker.open.length) {
          const inner = input.slice(i + marker.open.length, close);
          if (inner.trim().length > 0 && !(marker.open === "*" && inner.startsWith("*"))) {
            flush();
            out.push({ type: marker.type, children: parseInline(inner, depth + 1, options) });
            i = close + marker.open.length;
            matched = true;
          }
        }
        break;
      }
    }
    if (!matched) {
      text += input[i];
      i += 1;
    }
  }
  flush();
  return out;
}

/** The whole text → paragraphs and lists. */
export function parseRich(input: string | null | undefined, options: RichOptions = {}): Block[] {
  if (!input) return [];
  const blocks: Block[] = [];
  const usedIds = new Set<string>();
  const normalised = input.replace(/\r\n?/g, "\n");

  for (const chunk of normalised.split(/\n{2,}/)) {
    const lines = chunk.split("\n").filter((line) => line.trim().length > 0);
    let paragraph: string[] = [];
    const flushParagraph = () => {
      if (paragraph.length > 0) {
        blocks.push({
          type: "paragraph",
          children: parseInline(paragraph.join("\n").trim(), 0, options),
        });
      }
      paragraph = [];
    };

    for (const line of lines) {
      const heading = options.article ? HEADING.exec(line) : null;
      if (heading) {
        flushParagraph();
        const text = heading[2]!.trim();
        const children = parseInline(text, 0, {});
        // Unique anchors even when two headings share wording.
        let id = headingId(inlineToText(children));
        for (let n = 2; usedIds.has(id); n++) id = `${headingId(inlineToText(children))}-${n}`;
        usedIds.add(id);
        blocks.push({ type: "heading", level: heading[1]!.length === 2 ? 2 : 3, id, children });
        continue;
      }
      const bullet = BULLET.exec(line);
      const number = bullet ? null : NUMBER.exec(line);
      if (bullet || number) {
        flushParagraph();
        const type = bullet ? "bullets" : "numbers";
        const item = parseInline(((bullet ?? number) as RegExpExecArray)[1]!.trim(), 0, options);
        const last = blocks[blocks.length - 1];
        if (last && last.type === type) last.items.push(item);
        else blocks.push({ type, items: [item] } as Block);
      } else {
        paragraph.push(line);
      }
    }
    flushParagraph();
  }
  return blocks;
}

/** Plain text of inline nodes. */
export function inlineToText(nodes: Inline[]): string {
  return nodes
    .map((node) =>
      node.type === "text" ? node.text : node.type === "break" ? " " : inlineToText(node.children),
    )
    .join("");
}

/** Markers removed — for excerpts, meta descriptions and length rules. */
export function stripRich(input: string | null | undefined, options: RichOptions = {}): string {
  if (!input) return "";
  return parseRich(input, options)
    .map((block) =>
      block.type === "paragraph" || block.type === "heading"
        ? inlineToText(block.children)
        : block.items.map((item) => inlineToText(item)).join(" · "),
    )
    .join("\n\n");
}

/** Words in a text, for reading time. */
export function wordCount(input: string | null | undefined, options: RichOptions = {}): number {
  const text = stripRich(input, options).trim();
  return text ? text.split(/\s+/).length : 0;
}
