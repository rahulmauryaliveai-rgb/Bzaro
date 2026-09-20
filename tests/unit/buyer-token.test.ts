import { describe, expect, it } from "vitest";
import { BUYER_TOKEN_TTL_SECONDS, createBuyerToken, verifyBuyerToken } from "@/lib/buyer/token";

const SECRET = "test-buyer-cookie-secret-not-for-real-use";
const NOW = Date.UTC(2026, 8, 17, 12, 0, 0);

describe("buyer token", () => {
  it("round-trips a buyer id", () => {
    const token = createBuyerToken(SECRET, "buyer_123", NOW);
    expect(verifyBuyerToken(SECRET, token, NOW)).toEqual({
      ok: true,
      buyerId: "buyer_123",
      expiresAt: Math.floor(NOW / 1000) + BUYER_TOKEN_TTL_SECONDS,
    });
  });

  it("rejects a token signed with another secret", () => {
    const token = createBuyerToken("other-secret-that-is-long-enough", "buyer_123", NOW);
    expect(verifyBuyerToken(SECRET, token, NOW)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects an edited buyer id or expiry", () => {
    const token = createBuyerToken(SECRET, "buyer_123", NOW);
    const [, exp, sig] = token.split(".");
    expect(verifyBuyerToken(SECRET, `buyer_999.${exp}.${sig}`, NOW)).toMatchObject({
      ok: false,
      reason: "bad_signature",
    });
    expect(verifyBuyerToken(SECRET, `buyer_123.${Number(exp) + 1}.${sig}`, NOW)).toMatchObject({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("expires", () => {
    const token = createBuyerToken(SECRET, "buyer_123", NOW, 60);
    expect(verifyBuyerToken(SECRET, token, NOW + 59_000).ok).toBe(true);
    expect(verifyBuyerToken(SECRET, token, NOW + 60_000)).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects garbage without throwing", () => {
    for (const bad of [null, undefined, "", "a", "a.b", "a.b.c.d", "x".repeat(300)]) {
      expect(verifyBuyerToken(SECRET, bad, NOW)).toMatchObject({ ok: false, reason: "malformed" });
    }
  });

  it("refuses to mint a token for an id that would break the format", () => {
    expect(() => createBuyerToken(SECRET, "a.b", NOW)).toThrow();
    expect(() => createBuyerToken(SECRET, "", NOW)).toThrow();
  });
});
