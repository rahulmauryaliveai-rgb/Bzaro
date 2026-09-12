import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/env";
import {
  folderFor,
  UPLOAD_LIMITS,
  type MediaProvider,
  type SignedUpload,
  type UploadTarget,
  type UploadedAsset,
} from "@/lib/media/types";

/**
 * Development provider: stores uploads on the local disk.
 *
 * Exists for the same reason `ConsoleMailProvider` does — nobody should need a
 * Cloudinary account to run this project locally, and a catalogue you cannot
 * put a photograph into is a catalogue you cannot really test.
 *
 * ── It deliberately breaks the "never proxy bytes" rule ──────────────────────
 * The whole point of the Cloudinary path is that image bytes never pass through
 * the application server. This provider does exactly what that rule forbids: the
 * browser POSTs the file to our own route handler, which writes it to
 * `public/uploads`. That is acceptable at one developer on one machine and
 * unacceptable on a per-invocation platform, which is why `createProvider`
 * refuses to select it in production.
 *
 * ── It is still signed ───────────────────────────────────────────────────────
 * The token below is a real HMAC, checked by the receiving route. Not because a
 * developer's laptop is under attack, but because an unsigned development path
 * would let the dev and production flows diverge — and the flow that never gets
 * exercised is the one that breaks on launch day. Both providers hand the client
 * the same shape and verify the same way.
 */

const TOKEN_TTL_SECONDS = 600;

function secret(): string {
  // AUTH_SECRET is required in production and this provider never runs there,
  // so the development fallback is safe and keeps local setup to zero steps.
  return env.AUTH_SECRET || "development-media-secret";
}

/** `sellerId.target.expiry.signature` — everything the route must re-check. */
export function mintLocalToken(sellerId: string, target: UploadTarget): string {
  const expiry = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const body = `${sellerId}.${target}.${expiry}`;
  const mac = createHmac("sha256", secret()).update(body).digest("hex");
  return `${body}.${mac}`;
}

export type LocalTokenClaims = { sellerId: string; target: UploadTarget };

/** Verify a token minted above. Returns null for anything not provably ours. */
export function readLocalToken(token: string): LocalTokenClaims | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;

  const [sellerId, target, expiry, mac] = parts;
  const body = `${sellerId}.${target}.${expiry}`;

  const expected = createHmac("sha256", secret()).update(body).digest("hex");

  // Length check first: timingSafeEqual throws on a length mismatch.
  const left = Buffer.from(expected);
  const right = Buffer.from(mac);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;

  if (Number(expiry) * 1000 < Date.now()) return null;
  if (!(target in UPLOAD_LIMITS)) return null;

  return { sellerId, target: target as UploadTarget };
}

export class LocalMediaProvider implements MediaProvider {
  readonly name = "local" as const;
  readonly configured = true;

  async signUpload({
    sellerId,
    target,
  }: {
    sellerId: string;
    target: UploadTarget;
  }): Promise<SignedUpload> {
    return {
      provider: this.name,
      uploadUrl: "/api/media/upload",
      fields: { token: mintLocalToken(sellerId, target) },
      constraints: UPLOAD_LIMITS[target],
      expiresInSeconds: TOKEN_TTL_SECONDS,
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
    const url = typeof result.secure_url === "string" ? result.secure_url : null;
    const claimed = typeof result.signature === "string" ? result.signature : null;

    if (!publicId || !url || !claimed) return null;

    // Same three checks as the Cloudinary provider, so the two paths cannot
    // drift: is it ours, is it this seller's, is the URL where we expect.
    const expected = createHmac("sha256", secret()).update(publicId).digest("hex");
    const left = Buffer.from(expected);
    const right = Buffer.from(claimed);
    if (left.length !== right.length || !timingSafeEqual(left, right)) return null;

    if (!publicId.startsWith(`${folderFor(sellerId, target)}/`)) return null;
    if (!url.startsWith("/uploads/")) return null;

    return {
      provider: this.name,
      publicId,
      url,
      width: typeof result.width === "number" ? result.width : null,
      height: typeof result.height === "number" ? result.height : null,
      bytes: typeof result.bytes === "number" ? result.bytes : null,
      mimeType: typeof result.mime_type === "string" ? result.mime_type : null,
    };
  }

  async delete(): Promise<boolean> {
    // Local files are left in place. Cleaning up a development directory is not
    // worth the risk of a path-traversal bug in code that only ever runs on a
    // laptop; `public/uploads` is gitignored and can be deleted by hand.
    return true;
  }
}

/** Signature the upload route attaches, so `verifyUpload` can re-check it. */
export function signLocalAsset(publicId: string): string {
  return createHmac("sha256", secret()).update(publicId).digest("hex");
}
