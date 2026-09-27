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
 */

export type Inline =
  | { type: "text"; text: string }
  | { type: "bold" | "italic" | "underline"; children: Inline[] }
  | { type: "break" };

export type Block =
  | { type: "paragraph"; children: Inline[] }
  | { type: "bullets"; items: Inline[][] }
  | { type: "numbers"; items: Inline[][] };

const BULLET = /^\s*(?:[-•*])\s+(.*)$/;
const NUMBER = /^\s*\d{1,3}[.)]\s+(.*)$/;

// Order matters: "**" and "__" before the single-character "*".
const MARKERS: Array<{ open: string; type: "bold" | "italic" | "underline" }> = [
  { open: "**", type: "bold" },
  { open: "__", type: "underline" },
  { open: "*", type: "italic" },
];

/** Inline markers → a small tree. Unmatched markers stay as text. */
export function parseInline(input: string, depth = 0): Inline[] {
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
    if (depth < 4) {
      for (const marker of MARKERS) {
        if (!input.startsWith(marker.open, i)) continue;
        const close = input.indexOf(marker.open, i + marker.open.length);
        // Needs content, and "*" must not be the start of "**".
        if (close > i + marker.open.length) {
          const inner = input.slice(i + marker.open.length, close);
          if (inner.trim().length > 0 && !(marker.open === "*" && inner.startsWith("*"))) {
            flush();
            out.push({ type: marker.type, children: parseInline(inner, depth + 1) });
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
export function parseRich(input: string | null | undefined): Block[] {
  if (!input) return [];
  const blocks: Block[] = [];
  const normalised = input.replace(/\r\n?/g, "\n");

  for (const chunk of normalised.split(/\n{2,}/)) {
    const lines = chunk.split("\n").filter((line) => line.trim().length > 0);
    let paragraph: string[] = [];
    const flushParagraph = () => {
      if (paragraph.length > 0) {
        blocks.push({ type: "paragraph", children: parseInline(paragraph.join("\n").trim()) });
      }
      paragraph = [];
    };

    for (const line of lines) {
      const bullet = BULLET.exec(line);
      const number = bullet ? null : NUMBER.exec(line);
      if (bullet || number) {
        flushParagraph();
        const type = bullet ? "bullets" : "numbers";
        const item = parseInline(((bullet ?? number) as RegExpExecArray)[1]!.trim());
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

/** Markers removed — for excerpts, meta descriptions and length rules. */
export function stripRich(input: string | null | undefined): string {
  if (!input) return "";
  const inlineText = (nodes: Inline[]): string =>
    nodes
      .map((node) =>
        node.type === "text" ? node.text : node.type === "break" ? " " : inlineText(node.children),
      )
      .join("");
  return parseRich(input)
    .map((block) =>
      block.type === "paragraph"
        ? inlineText(block.children)
        : block.items.map((item) => inlineText(item)).join(" · "),
    )
    .join("\n\n");
}
