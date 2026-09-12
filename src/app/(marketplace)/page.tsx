import type { Metadata } from "next";
import Link from "next/link";
import { getHomepageContent } from "@/server/services/marketplace.service";
import { getPopularCities, getRootCategories } from "@/server/services/taxonomy.service";
import { SearchBar } from "@/components/marketplace/SearchBar";
import { ProductResultCard, SellerResultCard } from "@/components/marketplace/ResultCards";
import { JsonLd } from "@/components/seo/JsonLd";
import { marketplaceUrl } from "@/lib/utils/url";
import { clientEnv } from "@/env.client";

/**
 * Marketplace homepage.
 *
 * Search first, then routes into the taxonomy. B2B buyers arrive with a
 * specific part or material in mind far more often than they arrive to browse,
 * so the search box gets the prime position and the category grid is the
 * fallback for people who do not yet know the right term.
 */

const platform = clientEnv.NEXT_PUBLIC_PLATFORM_NAME;

export const metadata: Metadata = {
  title: `${platform} — B2B marketplace for verified suppliers`,
  description:
    "Find verified suppliers, manufacturers and service providers. Compare products, check business details and contact suppliers directly on WhatsApp.",
  alternates: { canonical: marketplaceUrl("/") },
};

export default async function HomePage() {
  const [content, categories, cities] = await Promise.all([
    getHomepageContent(),
    getRootCategories(),
    getPopularCities(12),
  ]);

  return (
    <>
      {/*
        WebSite + SearchAction tells search engines the site has its own search,
        which can surface a sitelinks search box. It is only honest to declare it
        now that /search actually exists.
      */}
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: platform,
          url: marketplaceUrl(),
          potentialAction: {
            "@type": "SearchAction",
            target: {
              "@type": "EntryPoint",
              urlTemplate: marketplaceUrl("/search?q={search_term_string}"),
            },
            "query-input": "required name=search_term_string",
          },
        }}
      />

      <section className="border-b border-neutral-200 bg-neutral-50">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Find verified suppliers
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-neutral-600">
            Compare products from{" "}
            <span className="font-medium text-neutral-900 tabular-nums">{content.sellerCount}</span>{" "}
            businesses and contact them directly.
          </p>

          <div className="mx-auto mt-8 max-w-2xl">
            <SearchBar />
          </div>

          {categories.length > 0 ? (
            <p className="mt-4 text-sm text-neutral-500">
              Popular:{" "}
              {categories.slice(0, 4).map((category, index) => (
                <span key={category.id}>
                  {index > 0 ? ", " : ""}
                  <Link
                    href={`/category${category.path}`}
                    className="underline underline-offset-2 hover:text-neutral-900"
                  >
                    {category.name}
                  </Link>
                </span>
              ))}
            </p>
          ) : null}
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-12">
        {categories.length > 0 ? (
          <section>
            <h2 className="mb-5 text-xl font-semibold tracking-tight">Browse by category</h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {categories.map((category) => (
                <li key={category.id}>
                  <Link
                    href={`/category${category.path}`}
                    className="block rounded-lg border border-neutral-200 p-4 transition-shadow hover:shadow-md"
                  >
                    <p className="font-medium">{category.name}</p>
                    <p className="mt-0.5 text-sm text-neutral-500 tabular-nums">
                      {category.productCount} product{category.productCount === 1 ? "" : "s"}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {content.products.length > 0 ? (
          <section className="mt-14">
            <div className="mb-5 flex items-baseline justify-between gap-4">
              <h2 className="text-xl font-semibold tracking-tight">Latest products</h2>
              <Link
                href="/products"
                className="text-sm text-neutral-600 underline underline-offset-2 hover:text-neutral-900"
              >
                View all
              </Link>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {content.products.map((product) => (
                <ProductResultCard
                  key={product.id}
                  hit={{
                    id: product.id,
                    slug: product.slug,
                    name: product.name,
                    shortDescription: product.shortDescription,
                    brand: product.brand,
                    priceMinor: product.priceMinor,
                    priceMaxMinor: product.priceMaxMinor,
                    currency: product.currency,
                    unit: product.unit,
                    priceOnRequest: product.priceOnRequest,
                    imageUrl: product.images[0]?.url ?? null,
                    imageAlt: product.images[0]?.alt ?? null,
                    isFeatured: product.isFeatured,
                    createdAt: product.createdAt,
                    sellerSlug: product.seller.slug,
                    sellerName: product.seller.businessName,
                    sellerVerified: product.seller.verifiedAt !== null,
                    sellerCity: product.seller.location?.name ?? null,
                    sellerState: product.seller.location?.parent?.name ?? null,
                    categoryName: product.category?.name ?? null,
                    categoryPath: product.category?.path ?? null,
                  }}
                />
              ))}
            </div>
          </section>
        ) : null}

        {content.sellers.length > 0 ? (
          <section className="mt-14">
            <div className="mb-5 flex items-baseline justify-between gap-4">
              <h2 className="text-xl font-semibold tracking-tight">Suppliers</h2>
              <Link
                href="/sellers"
                className="text-sm text-neutral-600 underline underline-offset-2 hover:text-neutral-900"
              >
                View directory
              </Link>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {content.sellers.map((seller) => (
                <SellerResultCard
                  key={seller.id}
                  hit={{
                    id: seller.id,
                    slug: seller.slug,
                    businessName: seller.businessName,
                    tagline: seller.tagline,
                    description: null,
                    logoUrl: seller.logoUrl,
                    city: seller.location?.name ?? null,
                    state: seller.location?.parent?.name ?? null,
                    productCount: seller.productCount,
                    serviceCount: seller.serviceCount,
                    ratingAvg: seller.ratingAvg,
                    ratingCount: seller.ratingCount,
                    isVerified: seller.verifiedAt !== null,
                    establishedYear: seller.establishedYear,
                  }}
                />
              ))}
            </div>
          </section>
        ) : null}

        {cities.length > 0 ? (
          <section className="mt-14 border-t border-neutral-200 pt-10">
            <h2 className="mb-4 text-xl font-semibold tracking-tight">Browse by city</h2>
            <ul className="flex flex-wrap gap-2">
              {cities.map((city) => (
                <li key={city.id}>
                  <Link
                    href={`/location${city.path}`}
                    className="inline-block rounded-full border border-neutral-300 px-3.5 py-1.5 text-sm hover:bg-neutral-50"
                  >
                    {city.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}
