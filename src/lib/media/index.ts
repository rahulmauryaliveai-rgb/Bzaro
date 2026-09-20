import "server-only";
import { env } from "@/env";
import { clientEnv } from "@/env.client";
import { CloudinaryMediaProvider } from "@/lib/media/cloudinary";
import { LocalMediaProvider } from "@/lib/media/local";
import type { MediaProvider } from "@/lib/media/types";

export * from "@/lib/media/types";

/**
 * Provider selection.
 *
 * Cloudinary when its three credentials are present, the local disk otherwise.
 *
 * Production WITHOUT Cloudinary is a misconfiguration, and this says so loudly
 * rather than silently writing to a serverless filesystem that is read-only,
 * ephemeral, or both. It still returns a provider rather than throwing: the
 * same reasoning as `lib/mail` — a platform that cannot accept new photographs
 * is degraded, but taking the whole site down over it is worse, and a seller
 * browsing their existing catalogue should not meet a 500.
 */
function createProvider(): MediaProvider {
  const cloudName = clientEnv.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

  if (cloudName && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) {
    return new CloudinaryMediaProvider(
      cloudName,
      env.CLOUDINARY_API_KEY,
      env.CLOUDINARY_API_SECRET,
    );
  }

  if (env.NODE_ENV === "production") {
    console.error(
      "[media] No upload provider configured in production. " +
        "Set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and " +
        "CLOUDINARY_API_SECRET. Uploads will be REFUSED.",
    );
  }

  return new LocalMediaProvider();
}

/**
 * Whether uploads should be offered at all.
 *
 * The local provider writes to disk, which does not work on a per-invocation
 * platform — so in production without Cloudinary the honest answer is to hide
 * the upload control rather than offer a button that cannot work.
 */
export const uploadsAvailable =
  env.NODE_ENV !== "production" ||
  Boolean(
    clientEnv.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME &&
    env.CLOUDINARY_API_KEY &&
    env.CLOUDINARY_API_SECRET,
  );

declare global {
  var __mediaProvider: MediaProvider | undefined;
}

// Cached across hot reloads, so a development restart does not rebuild the
// provider on every request.
export const media: MediaProvider = globalThis.__mediaProvider ?? createProvider();

if (env.NODE_ENV !== "production") globalThis.__mediaProvider = media;
