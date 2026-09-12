"use server";

import { headers } from "next/headers";
import { requireSeller } from "@/lib/auth/guards";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { media, uploadsAvailable, UPLOAD_LIMITS, type UploadTarget } from "@/lib/media";

/**
 * Upload signing and confirmation.
 *
 * Two calls bracket every upload:
 *
 *   1. `requestUploadAction` issues a signature scoped to the CALLER'S OWN
 *      tenant. The seller id comes from `requireSeller()`, never from the
 *      arguments — no parameter here can point the upload at another seller.
 *   2. `confirmUploadAction` takes what the browser says happened and refuses
 *      to believe it until the provider's own signature checks out.
 *
 * Step 2 is the one that is easy to skip and expensive to skip. Without it the
 * "upload" is just a client-supplied URL with extra steps, and a caller can
 * attach any address on the internet to their product page.
 */

const VALID_TARGETS = new Set<UploadTarget>(["product", "gallery", "logo", "cover"]);

export type UploadTicket =
  | {
      ok: true;
      uploadUrl: string;
      fields: Record<string, string>;
      maxBytes: number;
      formats: string[];
    }
  | { ok: false; error: string };

export type ConfirmedUpload =
  | {
      ok: true;
      url: string;
      publicId: string;
      provider: string;
      width: number | null;
      height: number | null;
      bytes: number | null;
      mimeType: string | null;
    }
  | { ok: false; error: string };

function isTarget(value: string): value is UploadTarget {
  return VALID_TARGETS.has(value as UploadTarget);
}

export async function requestUploadAction(target: string): Promise<UploadTicket> {
  const scope = await requireSeller();

  if (!isTarget(target)) {
    return { ok: false, error: "Unknown upload type." };
  }

  if (!uploadsAvailable) {
    return {
      ok: false,
      error: "Uploads are not configured on this deployment. Paste an image link instead.",
    };
  }

  // Signing is cheap, but each signature is a licence to write to our CDN
  // account. 30 per hour is generous for a seller photographing stock and
  // stops a compromised session from filling the bucket.
  const limit = await checkRateLimit("upload", getClientIp(await headers()));
  if (!limit.success) {
    return { ok: false, error: "Too many uploads for now. Try again in a little while." };
  }

  const signed = await media.signUpload({ sellerId: scope.sellerId, target });

  return {
    ok: true,
    uploadUrl: signed.uploadUrl,
    fields: signed.fields,
    maxBytes: signed.constraints.maxBytes,
    formats: signed.constraints.formats,
  };
}

/**
 * Verify what the browser reported and hand back a normalised asset.
 *
 * The payload is whatever the upload endpoint returned, forwarded by the
 * client — so it is untrusted input in the strictest sense. `verifyUpload`
 * re-checks the provider's signature and that the asset landed inside this
 * seller's folder; anything else is rejected without explanation of which
 * check failed, since the caller has no legitimate need to know.
 */
export async function confirmUploadAction(
  target: string,
  payload: unknown,
): Promise<ConfirmedUpload> {
  const scope = await requireSeller();

  if (!isTarget(target)) {
    return { ok: false, error: "Unknown upload type." };
  }

  const asset = await media.verifyUpload({
    sellerId: scope.sellerId,
    target,
    payload,
  });

  if (!asset) {
    return { ok: false, error: "That upload could not be verified. Please try again." };
  }

  // A provider may accept a file the browser mis-declared, so the ceiling is
  // re-checked against what actually arrived rather than what was promised.
  const maxBytes = UPLOAD_LIMITS[target].maxBytes;
  if (asset.bytes !== null && asset.bytes > maxBytes) {
    return { ok: false, error: "That image is too large." };
  }

  return {
    ok: true,
    url: asset.url,
    publicId: asset.publicId,
    provider: asset.provider,
    width: asset.width,
    height: asset.height,
    bytes: asset.bytes,
    mimeType: asset.mimeType,
  };
}
