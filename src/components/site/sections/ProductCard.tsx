import Link from "next/link";
import { formatPrice } from "@/lib/utils/money";
import type { ProductCard as ProductCardData } from "@/server/services/site-content.service";
import { SiteImage } from "@/components/site/sections/SiteImage";

/**
 * Product card for microsite grids.
 *
 * Every element is optional except the name, because real seller catalogues are
 * uneven: some products have images and prices, most have neither on day one.
 * A card that collapses gracefully is the difference between a sparse catalogue
 * looking "new" and looking "broken".
 */

export function ProductCard({ product }: { product: ProductCardData }) {
  const image = product.images[0];

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border transition-shadow hover:shadow-md"
      style={{ borderColor: "var(--site-border)", background: "var(--site-surface)" }}
    >
      <div
        className="aspect-4/3 w-full overflow-hidden"
        style={{ background: "var(--site-background)" }}
      >
        {image ? (
          <SiteImage
            src={image.url}
            alt={image.alt ?? product.name}
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs opacity-40">
            No image
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        {product.brand ? (
          <p className="text-xs tracking-wide uppercase opacity-60">{product.brand}</p>
        ) : null}

        <h3 className="leading-snug font-medium text-balance">{product.name}</h3>

        {product.shortDescription ? (
          <p className="line-clamp-2 text-sm opacity-70">{product.shortDescription}</p>
        ) : null}

        <p className="mt-auto pt-3 text-sm font-semibold tabular-nums">
          {formatPrice({
            minor: product.priceMinor,
            maxMinor: product.priceMaxMinor,
            currency: product.currency,
            unit: product.unit,
            onRequest: product.priceOnRequest,
          })}
        </p>

        {product.minOrderQty && product.minOrderQty > 1 ? (
          <p className="text-xs opacity-60">Min. order {product.minOrderQty}</p>
        ) : null}
      </div>
    </Link>
  );
}
