import Link from "next/link";
import { formatPrice } from "@/lib/utils/money";
import type { ProductCard as ProductCardData } from "@/server/services/site-content.service";
import { SiteImage } from "@/components/site/sections/SiteImage";
import { T } from "@/components/site/storefront/tokens";

/**
 * Storefront product tile, in the shapes the reference themes use:
 *
 *   card   image on top, name, price, "Get quote" — the default grid tile
 *   row    small image left, text right — for compact "best seller" lists
 *   hero   big image with the name overlaid — for the featured slot
 *
 * Everything is optional except the name (see sections/ProductCard.tsx for
 * why): real catalogues are uneven on day one.
 */
export type ProductTileVariant = "card" | "row" | "hero";

export function ProductTile({
  product,
  variant = "card",
  priority = false,
}: {
  product: ProductCardData;
  variant?: ProductTileVariant;
  priority?: boolean;
}) {
  const image = product.images[0];
  const price = formatPrice({
    minor: product.priceMinor,
    maxMinor: product.priceMaxMinor,
    currency: product.currency,
    unit: product.unit,
    onRequest: product.priceOnRequest,
  });
  const href = `/products/${product.slug}`;

  if (variant === "row") {
    return (
      <Link
        href={href}
        className={`group flex items-center gap-4 border ${T.border} ${T.radius} ${T.background} p-3 transition-shadow hover:shadow-md`}
      >
        <span className={`h-20 w-20 shrink-0 overflow-hidden ${T.radiusSm} ${T.surface}`}>
          {image ? (
            <SiteImage
              src={image.url}
              alt={image.alt ?? product.name}
              className="h-full w-full object-cover"
            />
          ) : null}
        </span>
        <span className="min-w-0">
          {product.category ? (
            <span className="block text-[11px] tracking-wide uppercase opacity-60">
              {product.category.name}
            </span>
          ) : null}
          <span className="block truncate font-medium group-hover:underline">{product.name}</span>
          <span className={`block text-sm font-semibold tabular-nums ${T.primaryText}`}>
            {price}
          </span>
        </span>
      </Link>
    );
  }

  if (variant === "hero") {
    return (
      <Link
        href={href}
        className={`group relative block overflow-hidden ${T.radius} ${T.surface} aspect-4/5 sm:aspect-square lg:aspect-auto lg:h-full`}
      >
        {image ? (
          <SiteImage
            src={image.url}
            alt={image.alt ?? product.name}
            priority={priority}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : null}
        <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/75 to-transparent p-6 text-white">
          {product.isFeatured ? (
            <span
              className={`mb-2 inline-block ${T.accentBg} rounded-full px-2.5 py-0.5 text-[11px] font-semibold`}
            >
              Featured
            </span>
          ) : null}
          <span className="site-display block text-2xl font-bold text-balance">{product.name}</span>
          <span className="mt-1 block text-sm opacity-90">{price}</span>
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={`group flex flex-col overflow-hidden border ${T.border} ${T.radius} ${T.background} transition-all hover:-translate-y-0.5 hover:shadow-lg`}
    >
      <span className={`relative aspect-square w-full overflow-hidden ${T.surface}`}>
        {image ? (
          <SiteImage
            src={image.url}
            alt={image.alt ?? product.name}
            priority={priority}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-xs opacity-40">
            No image
          </span>
        )}
        {product.isFeatured ? (
          <span
            className={`absolute top-3 left-3 ${T.accentBg} rounded-full px-2.5 py-0.5 text-[11px] font-semibold`}
          >
            Featured
          </span>
        ) : null}
      </span>

      <span className="flex flex-1 flex-col gap-1 p-4">
        {product.brand || product.category ? (
          <span className="text-[11px] tracking-wide uppercase opacity-60">
            {product.brand ?? product.category?.name}
          </span>
        ) : null}
        <span className="leading-snug font-medium text-balance group-hover:underline">
          {product.name}
        </span>
        <span className={`mt-auto pt-2 text-sm font-semibold tabular-nums ${T.primaryText}`}>
          {price}
        </span>
        {product.minOrderQty && product.minOrderQty > 1 ? (
          <span className="text-xs opacity-60">Min. order {product.minOrderQty}</span>
        ) : null}
        <span
          className={`mt-3 inline-flex items-center justify-center border ${T.primaryBorder} ${T.primaryText} ${T.radiusSm} px-3 py-1.5 text-xs font-semibold transition-colors group-hover:bg-(--site-primary) group-hover:text-white`}
        >
          Get quote
        </span>
      </span>
    </Link>
  );
}
