import { ImageGallery } from "@/components/shared/ImageGallery";
import type { GalleryEntry } from "@/server/services/site-content.service";

/**
 * Gallery page body: the shared auto-advancing slider, with every photo as a
 * clickable thumbnail beneath it and the current photo's caption under the
 * large image. The storefront home pages keep GalleryGrid for their preview.
 *
 * `alt` falls back through caption → title → empty string: an empty alt tells
 * a screen reader to skip a decorative image rather than read out a filename.
 */

export function GallerySlider({ items, name }: { items: GalleryEntry[]; name: string }) {
  return (
    <ImageGallery
      name={name}
      columns={8}
      aspect="16/9"
      images={items.map((item) => ({
        id: item.id,
        url: item.url,
        alt: item.alt ?? item.caption ?? item.title ?? "",
        caption: item.caption ?? item.title ?? null,
      }))}
    />
  );
}
