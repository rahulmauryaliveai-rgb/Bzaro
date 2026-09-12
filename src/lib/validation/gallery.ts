import { z } from "zod";
import { IMAGE_REFERENCE_MESSAGE, isUsableImageReference } from "@/lib/validation/image-reference";

/**
 * Gallery schemas.
 *
 * ── How the gallery differs from the catalogue ───────────────────────────────
 * A gallery item has no slug, no page of its own and no draft state. It is a
 * photograph with a caption, and it appears on the seller's website as soon as
 * it clears moderation. That makes ORDER the thing sellers actually care about
 * — the first few images are what a buyer sees — so `sortOrder` is a
 * first-class, editable property rather than an implementation detail.
 *
 * There is deliberately no "publish" concept. Inventing one would give the
 * seller a second, subtly different mental model for the same act of putting a
 * picture on their site.
 */

/**
 * The public gallery renders at most this many images.
 *
 * Enforced when ADDING, not only when displaying. A seller who uploads eighty
 * photographs and silently gets sixty is the exact failure this project keeps
 * trying to avoid: the feature appears to work and quietly does less than the
 * seller believes.
 */
export const MAX_GALLERY_ITEMS = 60;

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

/** See `@/lib/validation/image-reference` for what is and is not allowed. */
const imageReference = z
  .string()
  .trim()
  .min(1, "Add an image")
  .max(2048)
  .refine(isUsableImageReference, IMAGE_REFERENCE_MESSAGE);

/** One image being added. Metadata is present for uploads, absent for links. */
export const galleryItemSchema = z.object({
  url: imageReference,

  title: optionalText(120),
  caption: optionalText(300),
  /**
   * Alternative text.
   *
   * Optional, but prompted for. A gallery is the one surface on a seller's site
   * that is pure image — with no alt text it is invisible to a buyer using a
   * screen reader and carries nothing for search engines either.
   */
  alt: optionalText(200),

  provider: z.enum(["CLOUDINARY", "S3"]).optional(),
  publicId: optionalText(300),
  width: z.coerce.number().int().positive().max(20000).optional(),
  height: z.coerce.number().int().positive().max(20000).optional(),
});

export type GalleryItemInput = z.infer<typeof galleryItemSchema>;

/** Editing the text on an existing item. The image itself is not replaced. */
export const galleryEditSchema = z.object({
  id: z.string().cuid(),
  title: optionalText(120),
  caption: optionalText(300),
  alt: optionalText(200),
});

export const galleryDeleteSchema = z.object({
  id: z.string().cuid(),
  confirm: z.literal("on", { message: "Tick the box to confirm." }),
});

export const galleryMoveSchema = z.object({
  id: z.string().cuid(),
  direction: z.enum(["up", "down"]),
});
