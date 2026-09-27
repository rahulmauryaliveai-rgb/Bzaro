import { Fragment, type ReactNode } from "react";
import { parseRich, type Inline } from "@/lib/text/rich";

/**
 * Renders formatted seller text (src/lib/text/rich.ts) as React elements —
 * never as HTML, so there is nothing to sanitise.
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
    }
  });
}

export function RichText({
  text,
  className = "space-y-4 leading-relaxed",
}: {
  text: string | null | undefined;
  className?: string;
}) {
  const blocks = parseRich(text);
  if (blocks.length === 0) return null;
  return (
    <div className={className}>
      {blocks.map((block, index) => {
        if (block.type === "paragraph") return <p key={index}>{renderInline(block.children)}</p>;
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
