import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/env";
import { readLocalToken, signLocalAsset } from "@/lib/media/local";
import { folderFor, UPLOAD_LIMITS } from "@/lib/media/types";

/**
 * Receiver for the LOCAL media provider: development, and production hosts
 * with a persistent disk that opt in with MEDIA_LOCAL_UPLOADS=1 (the VPS).
 *
 * Cloudinary uploads never reach this route — the browser posts those straight
 * to Cloudinary. This exists so the catalogue can be used on a laptop with no
 * Cloudinary account. On a serverless production host it is refused outright:
 * the filesystem there is ephemeral and writing to it would appear to work
 * and then silently lose every image.
 *
 * ── Still checked properly ───────────────────────────────────────────────────
 * A development-only path is exactly where an unchecked file write gets
 * written, and then copied somewhere that matters. So the token is verified,
 * the destination is derived from the TOKEN rather than the request, the
 * extension comes from an allow-list rather than the filename, and the leaf
 * name is a fresh UUID. There is no point in the request where a caller-chosen
 * string reaches the path.
 */

export const runtime = "nodejs";

/** Extension from the declared MIME type — never from the uploaded filename. */
const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export async function POST(request: NextRequest) {
  if (env.NODE_ENV === "production" && !env.MEDIA_LOCAL_UPLOADS) {
    return NextResponse.json({ error: "not_available" }, { status: 404 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const token = String(form.get("token") ?? "");
  const claims = readLocalToken(token);

  // The token carries the seller and the target. Neither is read from the
  // request body, so a caller cannot redirect the write somewhere else.
  if (!claims) return NextResponse.json({ error: "invalid_token" }, { status: 403 });

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }

  const limits = UPLOAD_LIMITS[claims.target];

  if (file.size > limits.maxBytes) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  const extension = EXTENSION_BY_TYPE[file.type];
  if (!extension || !limits.formats.includes(extension)) {
    return NextResponse.json({ error: "unsupported_type" }, { status: 415 });
  }

  const folder = folderFor(claims.sellerId, claims.target);
  const leaf = `${randomUUID()}.${extension}`;
  const publicId = `${folder}/${leaf.replace(extname(leaf), "")}`;

  // Under public/, so Next serves it statically in development. Runtime data,
  // not a build input: turbopackIgnore stops the build from tracing (and, on
  // the VPS, following the shared/uploads symlink out of the project root).
  const directory = join(/* turbopackIgnore: true */ process.cwd(), "public", "uploads", folder);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, leaf), Buffer.from(await file.arrayBuffer()));

  // Shaped like a Cloudinary upload response, and signed, so the same
  // `verifyUpload` contract applies to both providers.
  return NextResponse.json({
    public_id: publicId,
    secure_url: `/uploads/${folder}/${leaf}`,
    bytes: file.size,
    mime_type: file.type,
    signature: signLocalAsset(publicId),
  });
}
