import "server-only";
import { db } from "@/lib/db";
import { forSeller } from "@/lib/db-tenant";
import { revalidateGallery } from "@/lib/cache/revalidate";
import { decideModeration } from "@/lib/validation/moderation";
import { getModerationSignals } from "@/server/services/catalog.service";
import { MAX_GALLERY_ITEMS, type GalleryItemInput } from "@/lib/validation/gallery";

/**
 * Gallery CRUD.
 *
 * Same three obligations as the catalogue service — stay inside the tenant,
 * decide moderation (D10), invalidate the right cache tag — with one thing it
 * does NOT do: it never recomputes index-eligibility.
 *
 * That is deliberate rather than an omission. The D2 gate counts published
 * products and services, and its image requirement is the logo or cover, not
 * gallery contents. Recomputing here would be work that can never change an
 * answer. If gallery items are ever added to the gate, this is the call site
 * that has to change with it.
 */

const NOT_DELETED = { deletedAt: null } as const;

/** Gap between sort positions, so an item can be moved without renumbering. */
const SORT_STEP = 10;

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function listGalleryItems(sellerId: string) {
  const tdb = forSeller(sellerId);

  return tdb.galleryItem.findMany({
    where: NOT_DELETED,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      url: true,
      title: true,
      caption: true,
      alt: true,
      width: true,
      height: true,
      sortOrder: true,
      moderationStatus: true,
      createdAt: true,
    },
  });
}

export async function countGalleryItems(sellerId: string): Promise<number> {
  return forSeller(sellerId).galleryItem.count({ where: NOT_DELETED });
}

export type AddGalleryResult =
  | { ok: true; added: number; moderation: "PENDING" | "APPROVED"; reason: string }
  | { ok: false; reason: "full"; message: string };

/**
 * Add one or more images to the end of the gallery.
 *
 * Refuses rather than truncating when the cap would be exceeded. Silently
 * dropping the overflow would leave a seller certain they had uploaded photos
 * that are nowhere on their site.
 */
export async function addGalleryItems(
  sellerId: string,
  sellerSlug: string,
  items: GalleryItemInput[],
): Promise<AddGalleryResult> {
  if (items.length === 0) {
    return { ok: false, reason: "full", message: "Choose at least one image." };
  }

  const existing = await countGalleryItems(sellerId);
  const room = MAX_GALLERY_ITEMS - existing;

  if (room <= 0) {
    return {
      ok: false,
      reason: "full",
      message: `Your gallery already holds the maximum of ${MAX_GALLERY_ITEMS} images. Remove one to add another.`,
    };
  }

  if (items.length > room) {
    return {
      ok: false,
      reason: "full",
      message: `That would take you past ${MAX_GALLERY_ITEMS} images. You have room for ${room} more.`,
    };
  }

  const signals = await getModerationSignals(sellerId);
  const decision = decideModeration(signals);

  // Continue the existing ordering rather than starting from zero, so new
  // images land at the end where the seller expects them.
  const last = await forSeller(sellerId).galleryItem.findFirst({
    where: NOT_DELETED,
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const base = (last?.sortOrder ?? 0) + SORT_STEP;

  await db.galleryItem.createMany({
    data: items.map((item, index) => ({
      sellerId,
      provider: item.provider ?? "CLOUDINARY",
      publicId: item.publicId ?? "",
      url: item.url,
      title: emptyToNull(item.title),
      caption: emptyToNull(item.caption),
      alt: emptyToNull(item.alt),
      width: item.width ?? null,
      height: item.height ?? null,
      sortOrder: base + index * SORT_STEP,
      moderationStatus: decision.status,
    })),
  });

  revalidateGallery(sellerSlug);

  return {
    ok: true,
    added: items.length,
    moderation: decision.status,
    reason: decision.reason,
  };
}

/** Edit the text on one item. The image itself is never replaced in place. */
export async function updateGalleryItem(
  sellerId: string,
  sellerSlug: string,
  id: string,
  fields: { title?: string; caption?: string; alt?: string },
): Promise<boolean> {
  const tdb = forSeller(sellerId);

  // `updateMany` through the tenant client: an id belonging to another seller
  // updates zero rows and is reported as not found, rather than throwing.
  const result = await tdb.galleryItem.updateMany({
    where: { id, ...NOT_DELETED },
    data: {
      title: emptyToNull(fields.title),
      caption: emptyToNull(fields.caption),
      alt: emptyToNull(fields.alt),
    },
  });

  if (result.count === 0) return false;

  revalidateGallery(sellerSlug);
  return true;
}

export async function deleteGalleryItem(
  sellerId: string,
  sellerSlug: string,
  id: string,
): Promise<boolean> {
  const tdb = forSeller(sellerId);

  const result = await tdb.galleryItem.updateMany({
    where: { id, ...NOT_DELETED },
    data: { deletedAt: new Date() },
  });

  if (result.count === 0) return false;

  revalidateGallery(sellerSlug);
  return true;
}

/**
 * Move one image one place earlier or later.
 *
 * Implemented as a SWAP with the adjacent row rather than a renumbering pass:
 * it touches two rows instead of all sixty, and it cannot corrupt the ordering
 * of items it did not touch if the request fails halfway.
 *
 * Up and down buttons rather than drag-and-drop — the dashboard works without
 * JavaScript throughout, and dragging is unusable on a phone and inaccessible
 * with a keyboard.
 */
export async function moveGalleryItem(
  sellerId: string,
  sellerSlug: string,
  id: string,
  direction: "up" | "down",
): Promise<boolean> {
  const tdb = forSeller(sellerId);

  const current = await tdb.galleryItem.findFirst({
    where: { id, ...NOT_DELETED },
    select: { id: true, sortOrder: true },
  });

  if (!current) return false;

  const neighbour = await tdb.galleryItem.findFirst({
    where: {
      ...NOT_DELETED,
      sortOrder: direction === "up" ? { lt: current.sortOrder } : { gt: current.sortOrder },
    },
    orderBy: { sortOrder: direction === "up" ? "desc" : "asc" },
    select: { id: true, sortOrder: true },
  });

  // Already first or last. Not an error: the seller pressed a button that had
  // nothing to do, which is different from a failure.
  if (!neighbour) return true;

  await db.$transaction([
    db.galleryItem.update({ where: { id: current.id }, data: { sortOrder: neighbour.sortOrder } }),
    db.galleryItem.update({ where: { id: neighbour.id }, data: { sortOrder: current.sortOrder } }),
  ]);

  revalidateGallery(sellerSlug);
  return true;
}
