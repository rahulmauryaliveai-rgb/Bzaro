"use server";

import { revalidatePath } from "next/cache";
import { requireSeller } from "@/lib/auth/guards";
import {
  galleryDeleteSchema,
  galleryEditSchema,
  galleryItemSchema,
  galleryMoveSchema,
} from "@/lib/validation/gallery";
import {
  addGalleryItems,
  deleteGalleryItem,
  moveGalleryItem,
  updateGalleryItem,
} from "@/server/services/gallery.service";

/**
 * Gallery Server Actions.
 *
 * As everywhere in the dashboard, the tenant comes from `requireSeller()` and
 * never from the form. Item ids do come from the form, and are made safe by the
 * tenant-scoped client: an id belonging to someone else matches zero rows.
 *
 * Move and delete are plain form actions so the gallery is fully operable
 * without JavaScript.
 */

export type GalleryActionState = {
  ok?: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
  awaitingReview?: boolean;
};

function fieldErrorsFrom(issues: Array<{ path: PropertyKey[]; message: string }>) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

/**
 * Add images.
 *
 * Accepts several at once: `imageUrl` repeats, with the metadata arrays
 * alongside it, exactly as the product form posts its images. Adding
 * photographs one page-load at a time would make populating a gallery tedious
 * enough that sellers would not bother.
 */
export async function addGalleryAction(
  _previous: GalleryActionState,
  formData: FormData,
): Promise<GalleryActionState> {
  const scope = await requireSeller();

  const read = (key: string) => formData.getAll(key).map((value) => String(value).trim());

  const urls = read("imageUrl");
  const titles = read("imageTitle");
  const captions = read("imageCaption");
  const alts = read("imageAlt");
  const publicIds = read("imagePublicId");
  const providers = read("imageProvider");
  const widths = read("imageWidth");
  const heights = read("imageHeight");

  const numeric = (value: string | undefined) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  };

  const candidates = urls
    .map((url, index) => ({
      url,
      title: titles[index] ?? "",
      caption: captions[index] ?? "",
      alt: alts[index] ?? "",
      publicId: publicIds[index] ?? "",
      provider: providers[index] === "S3" ? ("S3" as const) : undefined,
      width: numeric(widths[index]),
      height: numeric(heights[index]),
    }))
    // Blank rows are the form's empty slots, not mistakes.
    .filter((item) => item.url);

  if (candidates.length === 0) {
    return { error: "Choose at least one image." };
  }

  const parsed = galleryItemSchema.array().safeParse(candidates);

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const result = await addGalleryItems(scope.sellerId, scope.sellerSlug, parsed.data);

  if (!result.ok) return { error: result.message };

  revalidatePath("/dashboard/gallery");

  return {
    ok: true,
    message:
      result.moderation === "PENDING"
        ? result.reason
        : `Added ${result.added} image${result.added === 1 ? "" : "s"}.`,
    awaitingReview: result.moderation === "PENDING",
  };
}

export async function updateGalleryAction(
  _previous: GalleryActionState,
  formData: FormData,
): Promise<GalleryActionState> {
  const scope = await requireSeller();

  const parsed = galleryEditSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    title: String(formData.get("title") ?? ""),
    caption: String(formData.get("caption") ?? ""),
    alt: String(formData.get("alt") ?? ""),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const updated = await updateGalleryItem(scope.sellerId, scope.sellerSlug, parsed.data.id, {
    title: parsed.data.title,
    caption: parsed.data.caption,
    alt: parsed.data.alt,
  });

  if (!updated) return { error: "That image no longer exists." };

  revalidatePath("/dashboard/gallery");
  return { ok: true, message: "Saved." };
}

export async function deleteGalleryAction(
  _previous: GalleryActionState,
  formData: FormData,
): Promise<GalleryActionState> {
  const scope = await requireSeller();

  const parsed = galleryDeleteSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    confirm: String(formData.get("confirm") ?? ""),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const deleted = await deleteGalleryItem(scope.sellerId, scope.sellerSlug, parsed.data.id);

  if (!deleted) return { error: "That image no longer exists." };

  revalidatePath("/dashboard/gallery");
  return { ok: true, message: "Image removed." };
}

/**
 * Reorder. A `void` form action, so the up/down buttons need no JavaScript.
 *
 * A bad id or a no-op move is simply ignored: the seller pressed a button, and
 * an error banner for "this was already first" would be noise.
 */
export async function moveGalleryAction(formData: FormData): Promise<void> {
  const scope = await requireSeller();

  const parsed = galleryMoveSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    direction: String(formData.get("direction") ?? ""),
  });

  if (!parsed.success) return;

  await moveGalleryItem(
    scope.sellerId,
    scope.sellerSlug,
    parsed.data.id,
    parsed.data.direction,
  );

  revalidatePath("/dashboard/gallery");
}
