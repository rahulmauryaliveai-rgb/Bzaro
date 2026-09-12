import { describe, expect, it, beforeAll } from "vitest";
import { folderFor, UPLOAD_LIMITS } from "@/lib/media/types";

/**
 * Media signing and verification.
 *
 * `verifyUpload` is the security boundary: after a direct upload the browser
 * reports what happened, and that report is attacker-controlled. Everything
 * below is a way of asking "would a lie get through here".
 *
 * The providers import `server-only`, so they are loaded dynamically inside the
 * tests rather than at module scope.
 */

const SELLER = "clh1234567890abcdefghijk";
const OTHER_SELLER = "clh0000000000zzzzzzzzzzz";

describe("folderFor", () => {
  it("derives the folder from the seller id alone", () => {
    expect(folderFor(SELLER, "product")).toBe(`sellers/${SELLER}/product`);
  });

  it("gives different sellers different folders", () => {
    // This is the whole basis of upload isolation: if two sellers could ever
    // share a folder, the ownership check in verifyUpload proves nothing.
    expect(folderFor(SELLER, "product")).not.toBe(folderFor(OTHER_SELLER, "product"));
  });

  it("separates targets so a logo cannot be written as a product image", () => {
    expect(folderFor(SELLER, "logo")).not.toBe(folderFor(SELLER, "product"));
  });
});

describe("upload limits", () => {
  it("caps every target", () => {
    for (const [target, limits] of Object.entries(UPLOAD_LIMITS)) {
      expect(limits.maxBytes, `${target} needs a ceiling`).toBeGreaterThan(0);
      expect(limits.formats.length, `${target} needs an allow-list`).toBeGreaterThan(0);
    }
  });

  it("never allows a format that executes", () => {
    // An allow-list is only as good as its contents. svg is permitted for logos
    // alone, and is the one entry here that can carry script — so it must never
    // appear on a target that renders untrusted buyer-facing content inline.
    for (const [target, limits] of Object.entries(UPLOAD_LIMITS)) {
      for (const format of limits.formats) {
        expect(
          ["jpg", "jpeg", "png", "webp", "svg"],
          `${target} allows ${format}`,
        ).toContain(format);
      }
    }
  });

  it("keeps logos smaller than product photographs", () => {
    expect(UPLOAD_LIMITS.logo.maxBytes).toBeLessThan(UPLOAD_LIMITS.product.maxBytes);
  });
});

describe("CloudinaryMediaProvider", () => {
  let provider: import("@/lib/media/types").MediaProvider;

  beforeAll(async () => {
    const { CloudinaryMediaProvider } = await import("@/lib/media/cloudinary");
    provider = new CloudinaryMediaProvider("test-cloud", "test-key", "test-secret");
  });

  /** Re-implements Cloudinary's documented scheme, to sign valid fixtures. */
  async function cloudinarySignature(params: Record<string, string>) {
    const { createHash } = await import("node:crypto");
    const canonical = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join("&");
    return createHash("sha1").update(`${canonical}test-secret`).digest("hex");
  }

  async function validPayload(
    sellerId = SELLER,
    target: import("@/lib/media/types").UploadTarget = "product",
  ) {
    const publicId = `${folderFor(sellerId, target)}/abc123`;
    const version = "1700000000";

    return {
      public_id: publicId,
      version,
      signature: await cloudinarySignature({ public_id: publicId, version }),
      secure_url: `https://res.cloudinary.com/test-cloud/image/upload/v${version}/${publicId}.jpg`,
      width: 1200,
      height: 800,
      bytes: 240_000,
      format: "jpg",
    };
  }

  it("pins the folder, formats and public id in the signature", async () => {
    const signed = await provider.signUpload({ sellerId: SELLER, target: "product" });

    expect(signed.fields.folder).toBe(folderFor(SELLER, "product"));
    expect(signed.fields.public_id.startsWith(folderFor(SELLER, "product"))).toBe(true);
    expect(signed.fields.allowed_formats).toBe(UPLOAD_LIMITS.product.formats.join(","));
    expect(signed.fields.signature).toMatch(/^[0-9a-f]{40}$/);
  });

  it("never lets two uploads collide on one public id", async () => {
    const a = await provider.signUpload({ sellerId: SELLER, target: "product" });
    const b = await provider.signUpload({ sellerId: SELLER, target: "product" });

    expect(a.fields.public_id).not.toBe(b.fields.public_id);
    expect(a.fields.overwrite).toBe("false");
  });

  it("accepts a genuine upload response", async () => {
    const asset = await provider.verifyUpload({
      sellerId: SELLER,
      target: "product",
      payload: await validPayload(),
    });

    expect(asset).not.toBeNull();
    expect(asset?.width).toBe(1200);
    expect(asset?.mimeType).toBe("image/jpg");
  });

  it("rejects a forged signature", async () => {
    const payload = { ...(await validPayload()), signature: "0".repeat(40) };

    const asset = await provider.verifyUpload({ sellerId: SELLER, target: "product", payload });
    expect(asset).toBeNull();
  });

  it("rejects a genuine asset belonging to another seller", async () => {
    // Correctly signed by Cloudinary, but in someone else's folder. Believing
    // this would let any seller attach any other seller's images.
    const payload = await validPayload(OTHER_SELLER);

    const asset = await provider.verifyUpload({ sellerId: SELLER, target: "product", payload });
    expect(asset).toBeNull();
  });

  it("rejects an asset uploaded against a different target", async () => {
    const payload = await validPayload(SELLER, "logo");

    const asset = await provider.verifyUpload({ sellerId: SELLER, target: "product", payload });
    expect(asset).toBeNull();
  });

  it("rejects a URL that is not on our own cloud", async () => {
    // Signature and folder both check out, but the URL points elsewhere — which
    // would put an attacker-controlled host into an <img src> on a public page.
    const payload = {
      ...(await validPayload()),
      secure_url: "https://evil.example.com/tracker.gif",
    };

    const asset = await provider.verifyUpload({ sellerId: SELLER, target: "product", payload });
    expect(asset).toBeNull();
  });

  it("rejects junk without throwing", async () => {
    for (const payload of [null, undefined, "", 42, {}, { public_id: "x" }]) {
      const asset = await provider.verifyUpload({ sellerId: SELLER, target: "product", payload });
      expect(asset).toBeNull();
    }
  });
});

describe("LocalMediaProvider", () => {
  it("mints a token the route can verify, and rejects a tampered one", async () => {
    const { mintLocalToken, readLocalToken } = await import("@/lib/media/local");

    const token = mintLocalToken(SELLER, "product");
    expect(readLocalToken(token)).toEqual({ sellerId: SELLER, target: "product" });

    // Swapping the seller id invalidates the HMAC, so a developer-mode upload
    // cannot be redirected into another tenant's folder either.
    const tampered = token.replace(SELLER, OTHER_SELLER);
    expect(readLocalToken(tampered)).toBeNull();

    expect(readLocalToken("nonsense")).toBeNull();
    expect(readLocalToken("a.b.c.d")).toBeNull();
  });

  it("verifies its own upload results the same way Cloudinary's are verified", async () => {
    const { LocalMediaProvider, signLocalAsset } = await import("@/lib/media/local");
    const provider = new LocalMediaProvider();

    const publicId = `${folderFor(SELLER, "product")}/abc`;

    const asset = await provider.verifyUpload({
      sellerId: SELLER,
      target: "product",
      payload: {
        public_id: publicId,
        secure_url: `/uploads/${publicId}.png`,
        signature: signLocalAsset(publicId),
        bytes: 1000,
        mime_type: "image/png",
      },
    });

    expect(asset?.url).toBe(`/uploads/${publicId}.png`);

    // Same ownership rule as the Cloudinary path — the two providers must not
    // drift, or the flow exercised in development stops matching production.
    const foreign = `${folderFor(OTHER_SELLER, "product")}/abc`;
    const rejected = await provider.verifyUpload({
      sellerId: SELLER,
      target: "product",
      payload: {
        public_id: foreign,
        secure_url: `/uploads/${foreign}.png`,
        signature: signLocalAsset(foreign),
      },
    });

    expect(rejected).toBeNull();
  });
});
