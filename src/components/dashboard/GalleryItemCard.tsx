"use client";

import { useActionState } from "react";
import {
  deleteGalleryAction,
  moveGalleryAction,
  updateGalleryAction,
  type GalleryActionState,
} from "@/server/actions/gallery";
import { SiteImage } from "@/components/site/sections/SiteImage";

/**
 * One image in the gallery manager: reorder, edit its text, remove it.
 *
 * The up/down controls are plain form buttons rather than drag-and-drop. Order
 * is the thing sellers most want to change — the first images are what a buyer
 * sees — and dragging is unusable on a phone, inaccessible from a keyboard, and
 * needs JavaScript, which the rest of this dashboard does not.
 */

const INITIAL: GalleryActionState = {};

export type GalleryCardItem = {
  id: string;
  url: string;
  title: string | null;
  caption: string | null;
  alt: string | null;
  moderationStatus: string;
};

export function GalleryItemCard({
  item,
  position,
  total,
}: {
  item: GalleryCardItem;
  /** 1-based, for the "Image 3 of 12" label. */
  position: number;
  total: number;
}) {
  const [editState, editAction, editing] = useActionState(updateGalleryAction, INITIAL);
  const [deleteState, deleteAction, deleting] = useActionState(deleteGalleryAction, INITIAL);

  const awaitingReview = item.moderationStatus !== "APPROVED";

  return (
    <li className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap gap-4">
        <div className="shrink-0">
          <SiteImage
            src={item.url}
            alt={item.alt ?? ""}
            width={120}
            height={120}
            className="h-28 w-28 rounded object-cover"
          />

          <div className="mt-2 flex items-center gap-1">
            {/*
              Two separate single-button forms. A `disabled` button at the ends
              would be a dead control the seller has to reason about; omitting
              it says the same thing more quietly.
            */}
            {position > 1 ? (
              <form action={moveGalleryAction}>
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="direction" value="up" />
                <button
                  type="submit"
                  aria-label={`Move ${item.title ?? "image"} earlier`}
                  className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
                >
                  ↑
                </button>
              </form>
            ) : null}

            {position < total ? (
              <form action={moveGalleryAction}>
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="direction" value="down" />
                <button
                  type="submit"
                  aria-label={`Move ${item.title ?? "image"} later`}
                  className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
                >
                  ↓
                </button>
              </form>
            ) : null}

            <span className="ml-1 text-xs text-neutral-500">
              {position} of {total}
            </span>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          {awaitingReview ? (
            <p className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900">
              Awaiting review — not yet visible on your website.
            </p>
          ) : null}

          <form action={editAction} className="space-y-2">
            <input type="hidden" name="id" value={item.id} />

            <input
              name="title"
              defaultValue={item.title ?? ""}
              placeholder="Title (optional)"
              maxLength={120}
              className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
            />
            <input
              name="caption"
              defaultValue={item.caption ?? ""}
              placeholder="Caption (optional)"
              maxLength={300}
              className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
            />
            <input
              name="alt"
              defaultValue={item.alt ?? ""}
              placeholder="Describe the image"
              maxLength={200}
              aria-invalid={!item.alt ? true : undefined}
              className={`w-full rounded-md border px-3 py-1.5 text-sm ${
                item.alt ? "border-neutral-300" : "border-amber-400"
              }`}
            />

            {!item.alt ? (
              <p className="text-xs text-amber-800">
                No description yet. Without one this photograph is invisible to buyers using a
                screen reader, and to search engines.
              </p>
            ) : null}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={editing}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-50 disabled:opacity-60"
              >
                {editing ? "Saving…" : "Save"}
              </button>

              {editState.ok ? (
                <span role="status" className="text-xs text-teal-700">
                  {editState.message}
                </span>
              ) : editState.error ? (
                <span role="alert" className="text-xs text-red-600">
                  {editState.error}
                </span>
              ) : null}
            </div>
          </form>

          <details>
            <summary className="cursor-pointer text-xs text-red-700">Remove this image</summary>

            <form action={deleteAction} className="mt-2 space-y-2">
              <input type="hidden" name="id" value={item.id} />

              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" name="confirm" />
                <span>Yes, remove it from my website</span>
              </label>

              {deleteState.fieldErrors?.confirm ? (
                <p className="text-xs text-red-600">{deleteState.fieldErrors.confirm}</p>
              ) : null}
              {deleteState.error ? (
                <p className="text-xs text-red-600">{deleteState.error}</p>
              ) : null}

              <button
                type="submit"
                disabled={deleting}
                className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-60"
              >
                {deleting ? "Removing…" : "Remove"}
              </button>
            </form>
          </details>
        </div>
      </div>
    </li>
  );
}
