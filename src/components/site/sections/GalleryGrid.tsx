import { SiteImage } from "@/components/site/sections/SiteImage";
import type { GalleryEntry } from "@/server/services/site-content.service";

/**
 * Gallery grid.
 *
 * `alt` falls back through caption → title → empty string. An empty alt is the
 * correct value for a purely decorative image — it tells a screen reader to
 * skip it, which is far better than reading out a filename or a generic
 * "gallery image 4" for sixty images in a row.
 *
 * Intrinsic width/height are passed through when known so the browser can
 * reserve space and avoid layout shift as images load.
 */

export function GalleryGrid({ items }: { items: GalleryEntry[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item, index) => (
        <li key={item.id}>
          <figure
            className="overflow-hidden rounded-lg border"
            style={{ borderColor: "var(--site-border)" }}
          >
            <div className="aspect-square w-full" style={{ background: "var(--site-surface)" }}>
              <SiteImage
                src={item.url}
                alt={item.alt ?? item.caption ?? item.title ?? ""}
                width={item.width}
                height={item.height}
                priority={index < 4}
                className="h-full w-full object-cover"
              />
            </div>
            {item.caption || item.title ? (
              <figcaption className="px-3 py-2 text-xs opacity-70">
                {item.caption ?? item.title}
              </figcaption>
            ) : null}
          </figure>
        </li>
      ))}
    </ul>
  );
}
