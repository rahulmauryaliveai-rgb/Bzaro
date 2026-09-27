"use client";

import { useRef, useState } from "react";
import { Bold, Eye, Italic, List, ListOrdered, Pencil, Underline } from "lucide-react";
import { RichText } from "@/components/shared/RichText";

/**
 * A small formatting editor for seller text (About us). The toolbar writes
 * the markers from src/lib/text/rich.ts into an ordinary textarea — so the
 * form still posts plain text, keyboard and mobile typing behave normally, and
 * Preview shows exactly what buyers will see.
 *
 * Shortcuts: Ctrl/⌘+B bold, Ctrl/⌘+I italic, Ctrl/⌘+U underline.
 */

type Props = {
  id: string;
  name: string;
  defaultValue?: string;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  onValueChange?: (value: string) => void;
};

const WRAP = { bold: "**", italic: "*", underline: "__" } as const;
const PLACEHOLDER = {
  bold: "bold text",
  italic: "italic text",
  underline: "underlined text",
} as const;

export function RichTextEditor({
  id,
  name,
  defaultValue = "",
  rows = 8,
  maxLength = 5000,
  placeholder,
  onValueChange,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [preview, setPreview] = useState(false);

  function commit(next: string, selectStart: number, selectEnd: number) {
    const area = ref.current;
    if (!area) return;
    const clipped = next.slice(0, maxLength);
    area.value = clipped;
    setValue(clipped);
    onValueChange?.(clipped);
    area.focus();
    area.setSelectionRange(selectStart, Math.min(selectEnd, clipped.length));
  }

  function wrap(kind: keyof typeof WRAP) {
    const area = ref.current;
    if (!area) return;
    const marker = WRAP[kind];
    const { selectionStart: start, selectionEnd: end, value: text } = area;
    const selected = text.slice(start, end);

    // Already wrapped → unwrap (toggle).
    const before = text.slice(start - marker.length, start);
    const after = text.slice(end, end + marker.length);
    if (selected && before === marker && after === marker) {
      commit(
        text.slice(0, start - marker.length) + selected + text.slice(end + marker.length),
        start - marker.length,
        end - marker.length,
      );
      return;
    }

    const inner = selected || PLACEHOLDER[kind];
    // Keep surrounding spaces outside the markers: "**word** " not "**word **".
    const lead = inner.match(/^\s*/)?.[0] ?? "";
    const trail = inner.match(/\s*$/)?.[0] ?? "";
    const core = inner.trim() || PLACEHOLDER[kind];
    const insert = `${lead}${marker}${core}${marker}${trail}`;
    const next = text.slice(0, start) + insert + text.slice(end);
    const coreStart = start + lead.length + marker.length;
    commit(next, coreStart, coreStart + core.length);
  }

  function list(kind: "bullets" | "numbers") {
    const area = ref.current;
    if (!area) return;
    const { selectionStart: start, selectionEnd: end, value: text } = area;
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    const nextBreak = text.indexOf("\n", end);
    const lineEnd = nextBreak === -1 ? text.length : nextBreak;
    const lines = text.slice(lineStart, lineEnd).split("\n");

    const pattern = kind === "bullets" ? /^\s*[-•*]\s+/ : /^\s*\d{1,3}[.)]\s+/;
    const allListed = lines.every((line) => line.trim() === "" || pattern.test(line));
    let n = 0;
    const changed = lines.map((line) => {
      if (line.trim() === "") return line;
      const bare = line.replace(/^\s*(?:[-•*]|\d{1,3}[.)])\s+/, "");
      if (allListed) return bare;
      n += 1;
      return kind === "bullets" ? `- ${bare}` : `${n}. ${bare}`;
    });
    let block = changed.join("\n");
    if (!allListed && block.trim() === "") block = kind === "bullets" ? "- " : "1. ";

    // A list needs its own block: make sure a blank line separates it from a paragraph above.
    const above = text.slice(0, lineStart);
    const needsGap =
      !allListed &&
      above.length > 0 &&
      !above.endsWith("\n\n") &&
      !pattern.test(above.split("\n").slice(-2)[0] ?? "");
    const prefix = needsGap ? (above.endsWith("\n") ? "\n" : "\n\n") : "";
    const next = above + prefix + block + text.slice(lineEnd);
    const caret = lineStart + prefix.length + block.length;
    commit(next, caret, caret);
  }

  const button =
    "inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-700 hover:bg-neutral-200 disabled:opacity-40";

  return (
    <div className="overflow-hidden rounded-md border border-neutral-300 focus-within:ring-2 focus-within:ring-teal-600/30">
      <div
        className="flex flex-wrap items-center gap-0.5 border-b border-neutral-200 bg-neutral-50 px-1.5 py-1"
        role="toolbar"
        aria-label="Formatting"
      >
        <button
          type="button"
          className={button}
          onClick={() => wrap("bold")}
          disabled={preview}
          aria-label="Bold"
          title="Bold (Ctrl+B)"
        >
          <Bold className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={button}
          onClick={() => wrap("italic")}
          disabled={preview}
          aria-label="Italic"
          title="Italic (Ctrl+I)"
        >
          <Italic className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={button}
          onClick={() => wrap("underline")}
          disabled={preview}
          aria-label="Underline"
          title="Underline (Ctrl+U)"
        >
          <Underline className="h-4 w-4" aria-hidden="true" />
        </button>
        <span className="mx-1 h-5 w-px bg-neutral-300" aria-hidden="true" />
        <button
          type="button"
          className={button}
          onClick={() => list("bullets")}
          disabled={preview}
          aria-label="Bullet list"
          title="Bullet list"
        >
          <List className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={button}
          onClick={() => list("numbers")}
          disabled={preview}
          aria-label="Numbered list"
          title="Numbered list"
        >
          <ListOrdered className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setPreview((on) => !on)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-200"
        >
          {preview ? (
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {preview ? "Edit" : "Preview"}
        </button>
      </div>

      {/* The textarea stays mounted (hidden in preview) so the form always posts it. */}
      <textarea
        ref={ref}
        id={id}
        name={name}
        rows={rows}
        maxLength={maxLength}
        defaultValue={defaultValue}
        placeholder={placeholder}
        hidden={preview}
        onChange={(event) => {
          setValue(event.currentTarget.value);
          onValueChange?.(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          if (!(event.ctrlKey || event.metaKey)) return;
          const key = event.key.toLowerCase();
          if (key === "b" || key === "i" || key === "u") {
            event.preventDefault();
            wrap(key === "b" ? "bold" : key === "i" ? "italic" : "underline");
          }
        }}
        className="block w-full resize-y border-0 px-3 py-2 text-sm focus:ring-0 focus:outline-none"
      />
      {preview ? (
        <div className="min-h-40 px-3 py-3 text-sm text-neutral-800">
          {value.trim() ? (
            <RichText text={value} className="space-y-3 leading-relaxed" />
          ) : (
            <p className="text-neutral-400">Nothing to preview yet.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
