"use client";

import { useActionState, useState } from "react";
import { addGalleryAction, type GalleryActionState } from "@/server/actions/gallery";
import { ImageUpload } from "@/components/dashboard/ImageUpload";
import { SaveBanner } from "@/components/dashboard/fields";

/**
 * Add images to the gallery.
 *
 * Several slots at once, because populating a gallery one page-load at a time
 * is tedious enough that sellers simply would not do it. Each slot carries its
 * own caption and alt text, since writing those while looking at the picture is
 * far easier than coming back to a grid of thumbnails later.
 */

const INITIAL: GalleryActionState = {};

type Slot = {
  url: string;
  title: string;
  caption: string;
  alt: string;
  publicId?: string;
  provider?: string;
  width?: number | null;
  height?: number | null;
};

const EMPTY: Slot = { url: "", title: "", caption: "", alt: "" };

export function GalleryAddForm({ remaining }: { remaining: number }) {
  const [state, action, pending] = useActionState(addGalleryAction, INITIAL);
  const [slots, setSlots] = useState<Slot[]>([{ ...EMPTY }, { ...EMPTY }]);

  const filled = slots.filter((slot) => slot.url).length;

  function update(index: number, next: Partial<Slot>) {
    setSlots(slots.map((slot, i) => (i === index ? { ...slot, ...next } : slot)));
  }

  if (remaining <= 0) {
    return (
      <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Your gallery is full. Remove an image to add another.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <SaveBanner
        error={state.error}
        message={state.ok ? state.message : undefined}
        awaitingReview={state.awaitingReview}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {slots.map((slot, index) => (
          <div key={index} className="rounded-lg border border-neutral-200 bg-white p-4">
            <ImageUpload
              target="gallery"
              label={`Image ${index + 1}`}
              value={slot.url}
              hint="JPG, PNG or WebP, up to 8 MB."
              onChange={(asset) =>
                update(index, {
                  url: asset?.url ?? "",
                  publicId: asset?.publicId ?? "",
                  provider: asset?.provider ?? "",
                  width: asset?.width ?? null,
                  height: asset?.height ?? null,
                })
              }
            />

            {/* Verified upload details travel as ordinary hidden fields. */}
            <input type="hidden" name="imagePublicId" value={slot.publicId ?? ""} />
            <input type="hidden" name="imageProvider" value={slot.provider ?? ""} />
            <input type="hidden" name="imageWidth" value={slot.width ?? ""} />
            <input type="hidden" name="imageHeight" value={slot.height ?? ""} />

            {/*
              The canonical `imageUrl` field, and the paste-a-link fallback in
              one. Naming it here rather than mirroring it into a hidden input
              is what keeps pasting a link working WITHOUT JavaScript: an upload
              needs scripting by nature, but typing an address should not.

              An upload writes into this same field, so there is exactly one
              named input per row and the parallel arrays stay aligned.
            */}
            <details className="mt-2" open={Boolean(slot.url)}>
              <summary className="cursor-pointer text-xs text-neutral-500">
                Or paste an image link
              </summary>
              <input
                type="text"
                inputMode="url"
                name="imageUrl"
                value={slot.url}
                onChange={(event) =>
                  // A pasted link carries no provider metadata; clearing it
                  // keeps a link from being recorded as one of our uploads.
                  update(index, {
                    url: event.currentTarget.value,
                    publicId: "",
                    provider: "",
                    width: null,
                    height: null,
                  })
                }
                placeholder="https://…"
                maxLength={2048}
                className="mt-2 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </details>

            {slot.url ? (
              <div className="mt-3 space-y-2">
                <input
                  name="imageTitle"
                  value={slot.title}
                  onChange={(event) => update(index, { title: event.currentTarget.value })}
                  placeholder="Title (optional)"
                  maxLength={120}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                />
                <input
                  name="imageCaption"
                  value={slot.caption}
                  onChange={(event) => update(index, { caption: event.currentTarget.value })}
                  placeholder="Caption (optional)"
                  maxLength={300}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                />
                <input
                  name="imageAlt"
                  value={slot.alt}
                  onChange={(event) => update(index, { alt: event.currentTarget.value })}
                  placeholder="Describe the image"
                  maxLength={200}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                />
                <p className="text-xs text-neutral-500">
                  The description is read aloud to buyers using a screen reader, and is the only
                  thing search engines can read in a photograph.
                </p>
              </div>
            ) : (
              // Empty slots still post their (blank) text fields, so the
              // parallel arrays on the server stay aligned by index.
              <>
                <input type="hidden" name="imageTitle" value="" />
                <input type="hidden" name="imageCaption" value="" />
                <input type="hidden" name="imageAlt" value="" />
              </>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || filled === 0}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
        >
          {pending ? "Adding…" : `Add ${filled || ""} image${filled === 1 ? "" : "s"}`.trim()}
        </button>

        {slots.length < remaining ? (
          <button
            type="button"
            onClick={() => setSlots([...slots, { ...EMPTY }])}
            className="text-sm text-teal-700 underline underline-offset-2"
          >
            Add another slot
          </button>
        ) : null}

        <span className="text-xs text-neutral-500">Room for {remaining} more.</span>
      </div>
    </form>
  );
}
