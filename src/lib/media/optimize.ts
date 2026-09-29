import "server-only";
import type { UploadTarget } from "@/lib/media/types";

/**
 * Shrink an uploaded photo before it is stored (D46, local uploads only —
 * Cloudinary transforms on delivery).
 *
 * Phone photos arrive at 3–8 MB and 4000 px wide; a product card shows them
 * at ~400 px. Storing the original made the homepage download ~750 KB for a
 * single tile. Here every raster image is auto-rotated from its EXIF, capped
 * to a sensible longest side, re-encoded in its own format (so the URL's
 * extension stays honest) and stripped of metadata — which also removes GPS
 * coordinates a seller never meant to publish.
 *
 * `sharp` ships with Next.js. If it cannot load, or the file is odd, the
 * original bytes are kept: an upload must never fail because of this step.
 */

const MAX_EDGE: Record<UploadTarget, number> = {
  product: 1600,
  gallery: 1600,
  cover: 2000,
  logo: 600,
};

export async function optimizeUpload(
  input: Buffer,
  extension: string,
  target: UploadTarget,
): Promise<Buffer> {
  if (extension === "svg") return input;
  try {
    const { default: sharp } = await import("sharp");
    const edge = MAX_EDGE[target];
    const pipeline = sharp(input, { failOn: "none" })
      .rotate()
      .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true });
    const output =
      extension === "png"
        ? await pipeline.png({ compressionLevel: 9, effort: 7 }).toBuffer()
        : extension === "webp"
          ? await pipeline.webp({ quality: 80 }).toBuffer()
          : await pipeline.jpeg({ quality: 80, mozjpeg: true, progressive: true }).toBuffer();
    return output.length < input.length ? output : input;
  } catch (error) {
    console.warn("[media] optimise skipped:", error instanceof Error ? error.message : error);
    return input;
  }
}
