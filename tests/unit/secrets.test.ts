import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";

/**
 * Envelope encryption for seller credentials.
 *
 * The properties worth asserting are the security ones: plaintext never
 * survives in the envelope, the same input encrypts differently every time,
 * and tampering fails closed rather than returning garbage that would then be
 * sent to a payment gateway.
 */

const KEY = randomBytes(32).toString("base64");

vi.mock("@/env", () => ({ env: { INTEGRATIONS_ENCRYPTION_KEY: KEY } }));

const { encryptSecret, decryptSecret, encryptJson, decryptJson, lastFour, encryptionAvailable } =
  await import("@/lib/crypto/secrets");

const SECRET = "rzp_live_9f21AbCdEf";

describe("encryptSecret / decryptSecret", () => {
  it("round-trips", () => {
    expect(decryptSecret(encryptSecret(SECRET))).toBe(SECRET);
  });

  it("never leaves the plaintext in the envelope", () => {
    const envelope = encryptSecret(SECRET);
    expect(envelope).not.toContain(SECRET);
    expect(envelope).not.toContain("rzp_live");
  });

  it("produces a different envelope every time (fresh IV)", () => {
    expect(encryptSecret(SECRET)).not.toBe(encryptSecret(SECRET));
  });

  it("is versioned so a future rotation can be recognised", () => {
    expect(encryptSecret(SECRET).startsWith("v1.")).toBe(true);
  });

  it("refuses a tampered ciphertext rather than returning garbage", () => {
    const parts = encryptSecret(SECRET).split(".");
    const ciphertext = Buffer.from(parts[3]!, "base64");
    ciphertext[0] ^= 0xff;
    parts[3] = ciphertext.toString("base64");

    expect(() => decryptSecret(parts.join("."))).toThrow();
  });

  it("refuses a tampered auth tag", () => {
    const parts = encryptSecret(SECRET).split(".");
    const tag = Buffer.from(parts[2]!, "base64");
    tag[0] ^= 0xff;
    parts[2] = tag.toString("base64");

    expect(() => decryptSecret(parts.join("."))).toThrow();
  });

  it("refuses an unknown envelope format", () => {
    expect(() => decryptSecret("v2.a.b.c")).toThrow(/Unrecognised/);
    expect(() => decryptSecret("nonsense")).toThrow(/Unrecognised/);
  });

  it("round-trips a config object", () => {
    const config = { keyId: "rzp_test_1", keySecret: "shh", webhookSecret: "hook" };
    expect(decryptJson(encryptJson(config))).toEqual(config);
  });
});

describe("lastFour", () => {
  it("shows only enough to recognise which key is saved", () => {
    expect(lastFour("rzp_live_9f21AbCdEf")).toBe("CdEf");
    expect(lastFour("abc")).toBe("••••");
  });
});

describe("encryptionAvailable", () => {
  beforeEach(() => vi.resetModules());

  it("is true with a valid key", () => {
    expect(encryptionAvailable()).toBe(true);
  });

  it("is false — rather than throwing — when the key is missing", async () => {
    vi.doMock("@/env", () => ({ env: { INTEGRATIONS_ENCRYPTION_KEY: undefined } }));
    const mod = await import("@/lib/crypto/secrets");
    expect(mod.encryptionAvailable()).toBe(false);
    expect(() => mod.encryptSecret("x")).toThrow(/INTEGRATIONS_ENCRYPTION_KEY/);
  });

  it("rejects a key of the wrong length", async () => {
    vi.doMock("@/env", () => ({
      env: { INTEGRATIONS_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") },
    }));
    const mod = await import("@/lib/crypto/secrets");
    expect(() => mod.encryptSecret("x")).toThrow(/32 bytes/);
  });
});
