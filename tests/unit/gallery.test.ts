import { describe, expect, it } from "vitest";
import {
  galleryDeleteSchema,
  galleryEditSchema,
  galleryItemSchema,
  galleryMoveSchema,
  MAX_GALLERY_ITEMS,
} from "@/lib/validation/gallery";

/**
 * Gallery rules.
 *
 * The image-reference rule carries the most weight here: a gallery is pure
 * `<img src>` on a public page, so anything that reaches it has to be a URL and
 * nothing else.
 */

describe("galleryItemSchema", () => {
  it("accepts an image with nothing but a URL", () => {
    // Title, caption and alt are all optional. A seller uploading ten photos
    // should not be forced to write ten captions before any of them appear.
    expect(galleryItemSchema.safeParse({ url: "https://cdn.example.com/a.jpg" }).success).toBe(
      true,
    );
  });

  it("accepts a site-relative path from the development media provider", () => {
    expect(galleryItemSchema.safeParse({ url: "/uploads/sellers/x/gallery/a.png" }).success).toBe(
      true,
    );
  });

  it("rejects a URL with no image at all", () => {
    expect(galleryItemSchema.safeParse({ url: "" }).success).toBe(false);
  });

  it("rejects schemes that are not http(s) or a relative path", () => {
    // These are the ones that matter: each would execute or embed content if it
    // reached an `src` attribute on a public page.
    for (const url of [
      "javascript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "vbscript:msgbox",
      "file:///etc/passwd",
      "//evil.example.com/x.jpg",
    ]) {
      expect(galleryItemSchema.safeParse({ url }).success, `${url} should be rejected`).toBe(false);
    }
  });

  it("caps the text fields", () => {
    const url = "https://cdn.example.com/a.jpg";

    expect(galleryItemSchema.safeParse({ url, title: "x".repeat(121) }).success).toBe(false);
    expect(galleryItemSchema.safeParse({ url, caption: "x".repeat(301) }).success).toBe(false);
    expect(galleryItemSchema.safeParse({ url, alt: "x".repeat(201) }).success).toBe(false);
  });

  it("rejects absurd dimensions", () => {
    const url = "https://cdn.example.com/a.jpg";

    expect(galleryItemSchema.safeParse({ url, width: 999999 }).success).toBe(false);
    expect(galleryItemSchema.safeParse({ url, width: -1 }).success).toBe(false);
  });

  it("only accepts known providers", () => {
    const url = "https://cdn.example.com/a.jpg";

    expect(galleryItemSchema.safeParse({ url, provider: "CLOUDINARY" }).success).toBe(true);
    expect(galleryItemSchema.safeParse({ url, provider: "IMGUR" }).success).toBe(false);
  });
});

describe("galleryEditSchema", () => {
  it("requires a real id", () => {
    expect(galleryEditSchema.safeParse({ id: "not-a-cuid" }).success).toBe(false);
  });

  it("allows clearing the text fields", () => {
    // Deleting a caption must be possible; empty has to mean "unset" rather
    // than failing validation.
    const result = galleryEditSchema.safeParse({
      id: "clh1234567890abcdefghijk",
      title: "",
      caption: "",
      alt: "",
    });

    expect(result.success).toBe(true);
  });
});

describe("galleryDeleteSchema", () => {
  it("refuses to delete without an explicit tick", () => {
    // Removing a photograph is irreversible for the seller, so a missing
    // confirmation must never be read as consent.
    expect(galleryDeleteSchema.safeParse({ id: "clh1234567890abcdefghijk" }).success).toBe(false);
    expect(
      galleryDeleteSchema.safeParse({ id: "clh1234567890abcdefghijk", confirm: "" }).success,
    ).toBe(false);
    expect(
      galleryDeleteSchema.safeParse({ id: "clh1234567890abcdefghijk", confirm: "yes" }).success,
    ).toBe(false);
  });

  it("accepts a confirmed delete", () => {
    expect(
      galleryDeleteSchema.safeParse({ id: "clh1234567890abcdefghijk", confirm: "on" }).success,
    ).toBe(true);
  });
});

describe("galleryMoveSchema", () => {
  it("only accepts the two directions", () => {
    const id = "clh1234567890abcdefghijk";

    expect(galleryMoveSchema.safeParse({ id, direction: "up" }).success).toBe(true);
    expect(galleryMoveSchema.safeParse({ id, direction: "down" }).success).toBe(true);
    expect(galleryMoveSchema.safeParse({ id, direction: "sideways" }).success).toBe(false);
    expect(galleryMoveSchema.safeParse({ id, direction: "" }).success).toBe(false);
  });
});

describe("the gallery cap", () => {
  it("matches what the public page renders", () => {
    // The public gallery takes 60. If this ever exceeded that, a seller could
    // add images that are stored and never shown — the silent failure this
    // number exists to prevent.
    expect(MAX_GALLERY_ITEMS).toBe(60);
  });
});
