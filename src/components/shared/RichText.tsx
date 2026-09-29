import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { parseRich, type Inline, type RichOptions } from "@/lib/text/rich";

/**
 * Renders formatted text (src/lib/text/rich.ts) as React elements — never as
 * HTML, so there is nothing to sanitise. Seller text gets bold/italic/
 * underline and lists; articles (`article`) also get headings and links.
 */

function renderInline(nodes: Inline[]): ReactNode {
  return nodes.map((node, index) => {
    switch (node.type) {
      case "text":
        return <Fragment key={index}>{node.text}</Fragment>;
      case "break":
        return <br key={index} />;
      case "bold":
        return <strong key={index}>{renderInline(node.children)}</strong>;
      case "italic":
        return <em key={index}>{renderInline(node.children)}</em>;
      case "underline":
        return (
          <span key={index} className="underline underline-offset-2">
            {renderInline(node.children)}
          </span>
        );
      case "link":
        // Site paths go through next/link; outside links open normally but
        // pass no referrer or window handle.
        return node.href.startsWith("/") ? (
          <Link
            key={index}
            href={node.href}
            className="text-brand-700 underline underline-offset-2 hover:no-underline"
          >
            {renderInline(node.children)}
          </Link>
        ) : (
          <a
            key={index}
            href={node.href}
            rel="noopener noreferrer"
            className="text-brand-700 underline underline-offset-2 hover:no-underline"
          >
            {renderInline(node.children)}
          </a>
        );
    }
  });
}

export function RichText({
  text,
  className = "space-y-4 leading-relaxed",
  article = false,
}: {
  text: string | null | undefined;
  className?: string;
  /** Headings and links on (blog articles only, D45). */
  article?: boolean;
}) {
  const options: RichOptions = { article };
  const blocks = parseRich(text, options);
  if (blocks.length === 0) return null;
  return (
    <div className={className}>
      {blocks.map((block, index) => {
        if (block.type === "paragraph") return <p key={index}>{renderInline(block.children)}</p>;
        if (block.type === "heading") {
          return block.level === 2 ? (
            <h2
              key={index}
              id={block.id}
              className="mt-10 scroll-mt-24 text-2xl font-semibold tracking-tight text-neutral-900"
            >
              {renderInline(block.children)}
            </h2>
          ) : (
            <h3
              key={index}
              id={block.id}
              className="mt-8 scroll-mt-24 text-xl font-semibold text-neutral-900"
            >
              {renderInline(block.children)}
            </h3>
          );
        }
        const items = block.items.map((item, itemIndex) => (
          <li key={itemIndex}>{renderInline(item)}</li>
        ));
        return block.type === "bullets" ? (
          <ul key={index} className="list-disc space-y-1 pl-6">
            {items}
          </ul>
        ) : (
          <ol key={index} className="list-decimal space-y-1 pl-6">
            {items}
          </ol>
        );
      })}
    </div>
  );
}
