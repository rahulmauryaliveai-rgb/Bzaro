import { expect, test } from "@playwright/test";

/**
 * The media upload surface, seen from outside.
 *
 * This suite runs against a PRODUCTION build, which is the important context
 * here: `/api/media/upload` is the local development provider's receiver — it
 * writes files to disk — and it must not exist in a production deployment,
 * where the filesystem is ephemeral and a write endpoint is pure liability.
 *
 * So the property under test is absence, not rejection. The token-checking
 * behaviour that applies in development is covered by `tests/unit/media.test.ts`,
 * which exercises `readLocalToken` and both providers' `verifyUpload` directly.
 *
 * Cloudinary uploads never touch this route at all: the browser posts those
 * straight to Cloudinary with a signature the server issued.
 */

const PORT = Number(process.env.PORT ?? 3000);
const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? `lvh.me:${PORT}`;
const APEX = `http://${ROOT}`;
const UPLOAD = `${APEX}/api/media/upload`;

/** A real 1×1 PNG, so a rejection cannot be blamed on a malformed file. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const isProductionBuild = !process.env.PW_DEV;

test.describe("the local upload receiver", () => {
  test("does not accept files in a production build", async ({ request }) => {
    test.skip(!isProductionBuild, "only meaningful against a production build");

    const response = await request.post(UPLOAD, {
      multipart: {
        token: "anything",
        file: { name: "photo.png", mimeType: "image/png", buffer: PNG },
      },
    });

    // 404, not 403: in production this endpoint should not appear to exist.
    expect(response.status()).toBe(404);
  });

  test("writes nothing even when the request looks well formed", async ({ request }) => {
    test.skip(!isProductionBuild, "only meaningful against a production build");

    const response = await request.post(UPLOAD, {
      multipart: {
        token: "seller.product.99999999999.deadbeef",
        file: { name: "photo.png", mimeType: "image/png", buffer: PNG },
      },
    });

    expect(response.status()).toBe(404);

    const body = await response.text();
    // No public id, no URL: nothing was stored and nothing is claimed to be.
    expect(body).not.toContain("secure_url");
    expect(body).not.toContain("public_id");
  });

  test("rejects a token in development rather than trusting it", async ({ request }) => {
    test.skip(isProductionBuild, "development-only behaviour");

    const response = await request.post(UPLOAD, {
      multipart: {
        token: "some-seller.product.99999999999.deadbeef",
        file: { name: "photo.png", mimeType: "image/png", buffer: PNG },
      },
    });

    expect(response.status()).toBe(403);
  });
});

test.describe("signing is never a plain URL", () => {
  test("there is no GET endpoint that hands out an upload signature", async ({ request }) => {
    // Signatures come only from a Server Action behind `requireSeller()`. If a
    // signing URL ever appeared, anyone could mint write access to the CDN.
    for (const path of ["/api/media/sign", "/api/media/signature", "/api/media"]) {
      const response = await request.get(`${APEX}${path}`, { maxRedirects: 0 });
      expect(response.status(), `${path} should not exist`).toBe(404);
    }
  });
});
