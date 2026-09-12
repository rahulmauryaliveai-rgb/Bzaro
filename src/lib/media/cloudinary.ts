import "server-only";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import {
  folderFor,
  UPLOAD_LIMITS,
  type MediaProvider,
  type SignedUpload,
  type UploadTarget,
  type UploadedAsset,
} from "@/lib/media/types";

/**
 * Cloudinary, over plain `fetch` and `node:crypto`.
 *
 * No SDK. Signing is a SHA-1 of sorted parameters plus the API secret, and
 * deletion is one POST — a dependency that exists to save twenty lines is a
 * dependency to audit and upgrade forever (the same reasoning as `lib/mail`).
 *
 * ── The signature is the security boundary ───────────────────────────────────
 * Cloudinary rejects any parameter the client adds that the signature does not
 * cover. So signing `folder`, `public_id` and `allowed_formats` does not merely
 * *suggest* those values — it makes them the only ones the upload can use. That
 * is what stops a caller uploading a PHP file into another seller's folder.
 *
 * `timestamp` bounds the signature's life: Cloudinary refuses signatures older
 * than roughly an hour.
 */

const SIGNATURE_TTL_SECONDS = 600;

/** Parameters Cloudinary excludes from the signature by its own rules. */
const UNSIGNED_PARAMS = new Set(["file", "cloud_name", "resource_type", "api_key"]);

function sign(params: Record<string, string>, apiSecret: string): string {
  // Sorted, `key=value`, joined by `&`, secret appended, SHA-1 hex. Cloudinary
  // defines this exactly; any deviation produces a signature it will reject.
  const canonical = Object.keys(params)
    .filter((key) => !UNSIGNED_PARAMS.has(key) && params[key] !== "")
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return createHash("sha1").update(`${canonical}${apiSecret}`).digest("hex");
}

/** Constant-time compare that tolerates length mismatches without throwing. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** A random, unguessable leaf name so an upload cannot overwrite another. */
function publicIdLeaf(): string {
  return `${Date.now().toString(36)}-${createHash("sha256")
    .update(randomUUID())
    .digest("hex")
    .slice(0, 16)}`;
}

export class CloudinaryMediaProvider implements MediaProvider {
  readonly name = "cloudinary" as const;
  readonly configured = true;

  constructor(
    private readonly cloudName: string,
    private readonly apiKey: string,
    private readonly apiSecret: string,
  ) {}

  async signUpload({
    sellerId,
    target,
  }: {
    sellerId: string;
    target: UploadTarget;
  }): Promise<SignedUpload> {
    const constraints = UPLOAD_LIMITS[target];
    const folder = folderFor(sellerId, target);

    const params: Record<string, string> = {
      timestamp: String(Math.floor(Date.now() / 1000)),
      folder,
      public_id: `${folder}/${publicIdLeaf()}`,
      allowed_formats: constraints.formats.join(","),
      // Strip camera metadata. Phone photographs carry GPS coordinates, and a
      // seller uploading stock photos from their workshop should not publish
      // their home address as a side effect.
      image_metadata: "false",
      // Never let an upload replace an existing asset at the same id.
      overwrite: "false",
    };

    const signature = sign(params, this.apiSecret);

    return {
      provider: this.name,
      uploadUrl: `https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`,
      fields: { ...params, api_key: this.apiKey, signature },
      constraints,
      expiresInSeconds: SIGNATURE_TTL_SECONDS,
    };
  }

  async verifyUpload({
    sellerId,
    target,
    payload,
  }: {
    sellerId: string;
    target: UploadTarget;
    payload: unknown;
  }): Promise<UploadedAsset | null> {
    if (!payload || typeof payload !== "object") return null;

    const result = payload as Record<string, unknown>;

    const publicId = typeof result.public_id === "string" ? result.public_id : null;
    const version = result.version === undefined ? null : String(result.version);
    const claimed = typeof result.signature === "string" ? result.signature : null;
    const url = typeof result.secure_url === "string" ? result.secure_url : null;

    if (!publicId || !version || !claimed || !url) return null;

    // 1. Did Cloudinary actually produce this? The upload response carries a
    //    signature over public_id and version; only the API secret can forge it.
    const expected = sign({ public_id: publicId, version }, this.apiSecret);
    if (!safeEqual(expected, claimed)) return null;

    // 2. Did it land in THIS seller's folder? A genuine Cloudinary response for
    //    somebody else's asset is still not this seller's to attach.
    const folder = folderFor(sellerId, target);
    if (!publicId.startsWith(`${folder}/`)) return null;

    // 3. Is the URL actually on our cloud? Otherwise a valid-looking response
    //    could point the page at an arbitrary host.
    if (!url.startsWith(`https://res.cloudinary.com/${this.cloudName}/`)) return null;

    return {
      provider: this.name,
      publicId,
      url,
      width: typeof result.width === "number" ? result.width : null,
      height: typeof result.height === "number" ? result.height : null,
      bytes: typeof result.bytes === "number" ? result.bytes : null,
      mimeType: typeof result.format === "string" ? `image/${result.format}` : null,
    };
  }

  async delete(publicId: string): Promise<boolean> {
    try {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = sign({ public_id: publicId, timestamp }, this.apiSecret);

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${this.cloudName}/image/destroy`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            public_id: publicId,
            timestamp,
            signature,
            api_key: this.apiKey,
          }),
        },
      );

      return response.ok;
    } catch (error) {
      // Best effort by contract: an orphaned CDN asset costs pennies, whereas
      // failing the seller's save because a delete call timed out costs their
      // work.
      console.error("[media] cloudinary delete failed:", error);
      return false;
    }
  }
}
