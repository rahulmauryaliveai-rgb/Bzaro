import Link from "next/link";
import type { ProductHit, SellerHit } from "@/lib/search/types";
import { formatPrice } from "@/lib/utils/money";

/**
 * Marketplace result cards.
 *
 * ── Where these link ─────────────────────────────────────────────────────────
 * Product cards link to the MARKETPLACE product page
 * (`/product/{seller}/{slug}`), not directly to the seller's subdomain. Two
 * reasons: the marketplace page shows cross-seller context a microsite cannot
 * (related suppliers, category navigation), and keeping the buyer on the apex
 * through discovery is what makes the marketplace worth visiting. The
 * marketplace page then canonicals to the microsite per D1, so the seller still
 * gets the ranking.
 *
 * Seller identity is always shown on a product card. In a B2B directory the
 * supplier matters as much as the item — buyers filter on who they will deal
 * with long before they compare specifications.
 */

export function ProductResultCard({ hit }: { hit: ProductHit }) {
  const locality = [hit.sellerCity, hit.sellerState].filter(Boolean).join(", ");

  return (
    <article className="group flex flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white transition-shadow hover:shadow-md">
      <Link href={`/product/${hit.sellerSlug}/${hit.slug}`} className="flex flex-1 flex-col">
        <div className="aspect-4/3 w-full overflow-hidden bg-neutral-100">
          {hit.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={hit.imageUrl}
              alt={hit.imageAlt ?? hit.name}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-neutral-400">
              No image
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-1 p-4">
          {hit.brand ? (
            <p className="text-xs tracking-wide text-neutral-500 uppercase">{hit.brand}</p>
          ) : null}

          <h3 className="leading-snug font-medium text-balance text-neutral-900">{hit.name}</h3>

          {hit.shortDescription ? (
            <p className="line-clamp-2 text-sm text-neutral-600">{hit.shortDescription}</p>
          ) : null}

          <p className="mt-auto pt-3 text-sm font-semibold text-neutral-900 tabular-nums">
            {formatPrice({
              minor: hit.priceMinor,
              maxMinor: hit.priceMaxMinor,
              currency: hit.currency,
              unit: hit.unit,
              onRequest: hit.priceOnRequest,
            })}
          </p>
        </div>
      </Link>

      <div className="flex items-center gap-1.5 border-t border-neutral-100 px-4 py-2.5 text-xs">
        <Link
          href={`/seller/${hit.sellerSlug}`}
          className="min-w-0 truncate font-medium text-neutral-700 hover:text-neutral-900 hover:underline"
        >
          {hit.sellerName}
        </Link>
        {hit.sellerVerified ? <VerifiedBadge /> : null}
        {locality ? <span className="ml-auto shrink-0 text-neutral-500">{locality}</span> : null}
      </div>
    </article>
  );
}

export function SellerResultCard({ hit }: { hit: SellerHit }) {
  const locality = [hit.city, hit.state].filter(Boolean).join(", ");

  return (
    <article className="flex gap-4 rounded-lg border border-neutral-200 bg-white p-5 transition-shadow hover:shadow-md">
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-neutral-100">
        {hit.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={hit.logoUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-lg font-semibold text-neutral-400">
            {hit.businessName.charAt(0)}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-medium text-neutral-900">
            <Link href={`/seller/${hit.slug}`} className="hover:underline">
              {hit.businessName}
            </Link>
          </h3>
          {hit.isVerified ? <VerifiedBadge /> : null}
        </div>

        {hit.tagline ? (
          <p className="mt-0.5 truncate text-sm text-neutral-600">{hit.tagline}</p>
        ) : null}

        <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
          {locality ? (
            <div className="flex gap-1">
              <dt className="sr-only">Location</dt>
              <dd>{locality}</dd>
            </div>
          ) : null}
          {hit.productCount > 0 ? (
            <div className="flex gap-1">
              <dt className="sr-only">Products</dt>
              <dd className="tabular-nums">{hit.productCount} products</dd>
            </div>
          ) : null}
          {hit.establishedYear ? (
            <div className="flex gap-1">
              <dt className="sr-only">Established</dt>
              <dd>Since {hit.establishedYear}</dd>
            </div>
          ) : null}
          {/* Ratings appear only with reviews behind them — "0.0 ★" reads as a
              bad score rather than an absent one. */}
          {hit.ratingCount > 0 ? (
            <div className="flex gap-1">
              <dt className="sr-only">Rating</dt>
              <dd className="tabular-nums">
                {hit.ratingAvg.toFixed(1)} ★ ({hit.ratingCount})
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
    </article>
  );
}

function VerifiedBadge() {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-800"
      title="Verified by the platform"
    >
      <span aria-hidden="true">✓</span>
      Verified
    </span>
  );
}
