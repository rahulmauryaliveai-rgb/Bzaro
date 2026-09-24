import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/env";

/**
 * Envelope encryption for seller-owned credentials (Phase 6).
 *
 * Razorpay and Shiprocket keys belong to the seller, not to Bzaro: we hold them
 * only so a checkout can run against the seller's own account. They are stored
 * AES-256-GCM encrypted under INTEGRATIONS_ENCRYPTION_KEY and never returned to
 * any client — the settings screen renders `configHint` (a last-4) instead.
 *
 * ── Why GCM and not CBC ──────────────────────────────────────────────────────
 * GCM authenticates as well as encrypts. Without the tag, a tampered ciphertext
 * decrypts to garbage that the application would then send to a payment
 * gateway; with it, tampering fails closed at `decryptSecret`.
 *
 * ── Format ───────────────────────────────────────────────────────────────────
 *   v1.<iv b64>.<tag b64>.<ciphertext b64>
 * Versioned so a future key rotation or algorithm change can be recognised and
 * migrated rather than guessed at.
 */

const VERSION = "v1";
const IV_LENGTH = 12; // 96 bits, the GCM standard
const KEY_LENGTH = 32; // AES-256

export class MissingEncryptionKeyError extends Error {
  constructor() {
    super(
      "INTEGRATIONS_ENCRYPTION_KEY is not set. Generate one with " +
        "`openssl rand -base64 32` before saving payment or shipping credentials.",
    );
    this.name = "MissingEncryptionKeyError";
  }
}

function key(): Buffer {
  const raw = env.INTEGRATIONS_ENCRYPTION_KEY;
  if (!raw) throw new MissingEncryptionKeyError();

  const decoded = Buffer.from(raw, "base64");
  if (decoded.length !== KEY_LENGTH) {
    throw new Error(
      `INTEGRATIONS_ENCRYPTION_KEY must decode to ${KEY_LENGTH} bytes, got ${decoded.length}.`,
    );
  }
  return decoded;
}

/** Whether credentials can be saved at all. Lets the UI explain, not crash. */
export function encryptionAvailable(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

export function decryptSecret(envelope: string): string {
  const parts = envelope.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Unrecognised secret envelope format.");
  }

  const [, ivB64, tagB64, ciphertextB64] = parts;
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64!, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64!, "base64"));

  // Throws on a bad tag — tampering and a wrong key both fail here rather than
  // returning plausible-looking garbage.
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64!, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** JSON convenience for the per-integration config objects. */
export function encryptJson(value: unknown): string {
  return encryptSecret(JSON.stringify(value));
}

export function decryptJson<T>(envelope: string): T {
  return JSON.parse(decryptSecret(envelope)) as T;
}

/**
 * The only part of a credential that may reach a client: enough to recognise
 * which key is saved, never enough to use it.
 */
export function lastFour(value: string): string {
  return value.length <= 4 ? "••••" : value.slice(-4);
}
