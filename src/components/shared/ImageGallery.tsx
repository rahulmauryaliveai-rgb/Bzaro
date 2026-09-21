"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

/**
 * Product image gallery: one large image with clickable thumbnails.
 *
 * Auto-advances every `intervalMs` while the visitor is not interacting —
 * hovering or focusing the gallery pauses it, and it stops entirely for
 * visitors who ask the OS for reduced motion. Choosing a thumbnail or using
 * the arrows restarts the timer, so a hand-picked image stays up for a full
 * interval rather than being swapped away half a second later.
 *
 * Plain <img> rather than next/image: seller media is not on the optimiser's
 * allowlist (see components/site/sections/SiteImage.tsx). The first image is
 * eager because it is above the fold; the rest lazy-load as thumbnails and
 * are already cached by the time they are shown large.
 *
 * Used on the marketplace product page and the storefront product page, so
 * colours come from CSS variables with neutral fallbacks and nothing here
 * assumes a template.
 */

const REDUCE_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReduceMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCE_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export type GalleryImage = {
  id: string;
  url: string;
  alt: string | null;
  /** Shown under the large image (storefront gallery page). */
  caption?: string | null;
};

export function ImageGallery({
  images,
  name,
  intervalMs = 4000,
  columns = 6,
  aspect = "4/3",
}: {
  images: GalleryImage[];
  name: string;
  intervalMs?: number;
  /** Thumbnail columns on wide screens; the gallery page uses more, product pages fewer. */
  columns?: 6 | 8;
  /** Frame shape: 4:3 suits a product beside its details, 16:9 a full-width gallery. */
  aspect?: "4/3" | "16/9";
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  // Bumped on every manual change so the effect below restarts its timer.
  const [epoch, setEpoch] = useState(0);
  const count = images.length;
  const reduceMotion = useSyncExternalStore(
    subscribeReduceMotion,
    () => window.matchMedia(REDUCE_MOTION).matches,
    () => false,
  );

  useEffect(() => {
    if (count < 2 || paused || reduceMotion || document.hidden) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % count), intervalMs);
    return () => window.clearInterval(timer);
  }, [count, paused, reduceMotion, intervalMs, epoch]);

  const go = useCallback(
    (next: number) => {
      setIndex(((next % count) + count) % count);
      setEpoch((e) => e + 1);
    },
    [count],
  );

  if (count === 0) return null;
  const current = images[index] ?? images[0]!;

  return (
    <div
      className="group/gallery"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") go(index + 1);
        if (event.key === "ArrowLeft") go(index - 1);
      }}
      role="region"
      aria-roledescription="carousel"
      aria-label={`${name} images`}
    >
      <div
        className={`relative w-full overflow-hidden rounded-lg border ${aspect === "16/9" ? "aspect-video" : "aspect-4/3"}`}
        style={{
          borderColor: "var(--site-border, #e5e5e5)",
          background: "var(--site-surface, #fafafa)",
        }}
        aria-live="polite"
      >
        {images.map((image, i) => (
          // Every image stays mounted (stacked, cross-fading) so switching is
          // instant and never shows a blank frame while the next one loads.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={image.id}
            src={image.url}
            alt={i === index ? (image.alt ?? name) : ""}
            loading={i === 0 ? "eager" : "lazy"}
            decoding="async"
            aria-hidden={i !== index}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
              i === index ? "opacity-100" : "opacity-0"
            }`}
          />
        ))}

        {count > 1 ? (
          <>
            <button
              type="button"
              onClick={() => go(index - 1)}
              aria-label="Previous image"
              className="absolute top-1/2 left-2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-neutral-800 opacity-0 shadow transition-opacity group-hover/gallery:opacity-100 hover:bg-white focus-visible:opacity-100"
            >
              <span aria-hidden="true">‹</span>
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              aria-label="Next image"
              className="absolute top-1/2 right-2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-neutral-800 opacity-0 shadow transition-opacity group-hover/gallery:opacity-100 hover:bg-white focus-visible:opacity-100"
            >
              <span aria-hidden="true">›</span>
            </button>
            <p className="absolute right-2 bottom-2 rounded-full bg-black/55 px-2 py-0.5 text-xs text-white tabular-nums">
              {index + 1} / {count}
            </p>
          </>
        ) : null}
      </div>

      {current.caption ? <p className="mt-2 text-sm opacity-70">{current.caption}</p> : null}

      {count > 1 ? (
        <ul
          className={`mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 ${columns === 8 ? "lg:grid-cols-8" : ""}`}
          role="tablist"
        >
          {images.map((image, i) => (
            <li key={image.id} role="presentation">
              <button
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Show image ${i + 1} of ${count}`}
                onClick={() => go(i)}
                className={`block aspect-square w-full overflow-hidden rounded-md border-2 transition-all ${
                  i === index ? "opacity-100" : "opacity-70 hover:opacity-100"
                }`}
                style={{
                  borderColor:
                    i === index ? "var(--site-primary, #1d4ed8)" : "var(--site-border, #e5e5e5)",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <span className="sr-only">
        {current.alt ?? name}, image {index + 1} of {count}
      </span>
    </div>
  );
}
