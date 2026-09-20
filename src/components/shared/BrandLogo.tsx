import Image from "next/image";
import Link from "next/link";
import { clientEnv } from "@/env.client";

/**
 * The Bzaro logo.
 *
 * Assets live in public/brand and are generated from the master PNG by the
 * script described in docs/BRAND.md — do not hand-edit them:
 *
 *   bzaro-logo.png      wordmark + tagline, transparent      960 × 282
 *   bzaro-wordmark.png  wordmark only, transparent           720 × 157
 *   bzaro-mark.png      the "B" with the awning, square      512 × 512
 *
 * All three are transparent, so they sit on the light marketplace header and
 * the dark admin sidebar alike. The wordmark is the default; the tagline
 * version is for large surfaces (auth pages, emails), the mark for tight ones.
 */

const VARIANTS = {
  wordmark: { src: "/brand/bzaro-wordmark.png", width: 720, height: 157 },
  full: { src: "/brand/bzaro-logo.png", width: 960, height: 282 },
  mark: { src: "/brand/bzaro-mark.png", width: 512, height: 512 },
} as const;

export function BrandLogo({
  variant = "wordmark",
  height = 32,
  href = "/",
  priority = false,
  className,
}: {
  variant?: keyof typeof VARIANTS;
  /** Rendered height in CSS pixels; width follows the asset's aspect ratio. */
  height?: number;
  /** Set to null to render without a link. */
  href?: string | null;
  priority?: boolean;
  className?: string;
}) {
  const asset = VARIANTS[variant];
  const width = Math.round((asset.width / asset.height) * height);
  const alt = clientEnv.NEXT_PUBLIC_PLATFORM_NAME;

  const image = (
    <Image
      src={asset.src}
      alt={alt}
      width={width}
      height={height}
      priority={priority}
      className={className}
      style={{ height, width: "auto" }}
    />
  );

  if (!href) return image;

  return (
    <Link href={href} aria-label={`${alt} home`} className="inline-flex items-center">
      {image}
    </Link>
  );
}
