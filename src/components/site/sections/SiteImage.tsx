/**
 * Image for microsite content.
 *
 * Deliberately a plain `<img>` rather than `next/image`.
 *
 * Seller media lives on a CDN that already resizes and format-negotiates
 * (Cloudinary), and `next/image` only accepts hosts listed in
 * `images.remotePatterns` — which is empty until Cloudinary is configured, so
 * routing seller images through the optimiser would fail closed in development
 * and add a second resize hop in production.
 *
 * `loading="lazy"` and `decoding="async"` are set explicitly since we are not
 * getting them from the framework component.
 */

export function SiteImage({
  src,
  alt,
  className,
  width,
  height,
  priority,
}: {
  src: string;
  alt: string;
  className?: string;
  width?: number | null;
  height?: number | null;
  /** Set on the one above-the-fold image per page; everything else lazy-loads. */
  priority?: boolean;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      width={width ?? undefined}
      height={height ?? undefined}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : undefined}
    />
  );
}
