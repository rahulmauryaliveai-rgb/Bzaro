/**
 * Media provider contract.
 *
 * ── Why uploads are DIRECT and SIGNED ────────────────────────────────────────
 * The browser sends the file straight to the CDN; the application server never
 * touches image bytes. On a per-invocation platform, proxying a 5 MB photograph
 * through a serverless function costs memory, execution time and bandwidth on
 * every single upload, and gives nothing in return — the CDN is better at
 * receiving files than we are.
 *
 * What the server keeps is AUTHORITY. It issues a short-lived signature that
 * pins every parameter the client could otherwise choose:
 *
 *   folder   — derived from the seller id, never from the request. Without this
 *              one seller can upload into another seller's folder.
 *   formats  — an allow-list. Without it the "image" upload accepts anything.
 *   size     — a ceiling, enforced by the provider rather than by the browser.
 *   public id — prefixed, so an upload cannot overwrite an existing asset.
 *
 * ── Why the result is verified rather than believed ──────────────────────────
 * After the upload the browser reports what happened. That report is attacker
 * controlled: a caller can invent a URL, a size, or someone else's public id and
 * post it back. `verifyUpload` therefore re-checks the provider's own signature
 * over the response and confirms the asset landed inside this seller's folder.
 * Nothing reaches the database on the client's word alone.
 */

export type MediaProviderName = "cloudinary" | "local";

/** What the upload is for. Decides folder, size ceiling and dimensions. */
export type UploadTarget = "product" | "gallery" | "logo" | "cover";

export type UploadConstraints = {
  maxBytes: number;
  /** Lower-case extensions, e.g. ["jpg", "png", "webp"]. */
  formats: string[];
};

/**
 * Everything the browser needs to perform the upload itself.
 *
 * `fields` is posted verbatim alongside the file. The client must not add to it
 * or reorder it: with a signed upload, any parameter not covered by the
 * signature is rejected by the provider, which is exactly the property that
 * makes this safe.
 */
export type SignedUpload = {
  provider: MediaProviderName;
  uploadUrl: string;
  fields: Record<string, string>;
  constraints: UploadConstraints;
  /** Seconds until the signature stops being accepted. */
  expiresInSeconds: number;
};

/** A verified asset, ready to be written to the database. */
export type UploadedAsset = {
  provider: MediaProviderName;
  publicId: string;
  url: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  mimeType: string | null;
};

export interface MediaProvider {
  readonly name: MediaProviderName;

  /** True when the provider is actually usable (credentials present). */
  readonly configured: boolean;

  signUpload(params: { sellerId: string; target: UploadTarget }): Promise<SignedUpload>;

  /**
   * Validate a raw upload result and normalise it.
   *
   * Returns `null` for anything that cannot be proven genuine and owned by this
   * seller. Callers must treat `null` as a rejection, never as "assume it was
   * fine" — this is the only thing standing between the database and an
   * arbitrary URL supplied by the client.
   */
  verifyUpload(params: {
    sellerId: string;
    target: UploadTarget;
    payload: unknown;
  }): Promise<UploadedAsset | null>;

  /** Remove an asset. Best effort: a failure here must not fail the request. */
  delete(publicId: string): Promise<boolean>;
}

/**
 * Per-target limits.
 *
 * Logos are small and square-ish; product photographs are the large ones. The
 * ceilings are deliberately modest — a seller photographing stock on a phone
 * produces 2–4 MB files, and accepting 25 MB originals only costs storage and
 * makes their own site slower.
 */
export const UPLOAD_LIMITS: Record<UploadTarget, UploadConstraints> = {
  product: { maxBytes: 8 * 1024 * 1024, formats: ["jpg", "jpeg", "png", "webp"] },
  gallery: { maxBytes: 8 * 1024 * 1024, formats: ["jpg", "jpeg", "png", "webp"] },
  logo: { maxBytes: 2 * 1024 * 1024, formats: ["jpg", "jpeg", "png", "webp", "svg"] },
  cover: { maxBytes: 8 * 1024 * 1024, formats: ["jpg", "jpeg", "png", "webp"] },
};

/**
 * Folder for a seller's assets.
 *
 * Built from the seller id alone. It is never taken from the request, and every
 * verification re-derives it rather than comparing against a value the client
 * sent — that is what stops one tenant writing into another's folder.
 */
export function folderFor(sellerId: string, target: UploadTarget): string {
  return `sellers/${sellerId}/${target}`;
}
