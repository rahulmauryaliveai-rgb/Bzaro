import type { Metadata } from "next";
import { getHomepageContent } from "@/server/services/marketplace.service";
import { getAllCities, getPopularCities } from "@/server/services/taxonomy.service";
import {
  getCategoryGrid,
  getPlatformStats,
  getPopularInCity,
  getTopCity,
} from "@/server/services/discovery.service";
import { CityPicker } from "@/components/marketplace/CityPicker";
import {
  CategoryGrid,
  CityChips,
  PopularInCity,
  PostRequirementCta,
} from "@/components/marketplace/Discovery";
import {
  Faq,
  HomeHero,
  HowItWorks,
  SectionHeading,
  SellerCta,
  StatsBand,
  TrustStrip,
  type HeroImage,
} from "@/components/marketplace/Home";
import { ProductResultCard, SellerResultCard } from "@/components/marketplace/ResultCards";
import { toProductHit, toSellerHit } from "@/components/marketplace/hits";
import { JsonLd } from "@/components/seo/JsonLd";
import { marketplaceUrl } from "@/lib/utils/url";
import { clientEnv } from "@/env.client";

/**
 * Marketplace homepage — the buyer's front door.
 *
 * ── ISR, not static ──────────────────────────────────────────────────────────
 * Rendered at most once an hour, and purged early by `revalidateSellerDiscovery`
 * whenever a seller is verified, changes city or category, or publishes a
 * product. Before this the page was prerendered once at build and a new seller
 * did not appear until the next deploy (SESSION_HANDOFF gotcha #1).
 *
 * Nothing here may read cookies or headers: the city picker is a client
 * component that navigates to the per-city page, which is itself ISR.
 *
 * ── Order of sections ────────────────────────────────────────────────────────
 * The page is a conversion funnel, top to bottom:
 *
 *   hero (search + city, post requirement)  → the two actions that create leads
 *   trust strip                             → why a buyer should bother
 *   category tiles                          → browse entry for the undecided
 *   popular in <top city>                   → proof there is supply here
 *   post requirement band                   → catch the buyer who found nothing
 *   how it works → latest products → suppliers → stats → seller CTA → FAQ → cities
 */

export const revalidate = 3600;

const platform = clientEnv.NEXT_PUBLIC_PLATFORM_NAME;

export const metadata: Metadata = {
  title: `${platform} — B2B marketplace for verified suppliers`,
  description:
    "Find verified suppliers, manufacturers and service providers. Compare products, check business details and contact suppliers directly on WhatsApp.",
  alternates: { canonical: marketplaceUrl("/") },
};

export default async function HomePage() {
  const [content, categories, popularCities, allCities, topCity, stats] = await Promise.all([
    getHomepageContent(),
    getCategoryGrid(),
    getPopularCities(12),
    getAllCities(),
    getTopCity(),
    getPlatformStats(),
  ]);
  const popular = topCity ? await getPopularInCity(topCity.id) : null;

  const heroImages: HeroImage[] = content.products
    .filter((product) => product.images[0]?.url)
    .slice(0, 4)
    .map((product) => ({
      url: product.images[0]!.url,
      alt: product.images[0]!.alt ?? product.name,
      href: `/product/${product.seller.slug}/${product.slug}`,
    }));

  const cityOptions = allCities.map((city) => ({ path: city.path, name: city.name }));

  return (
    <>
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
            "query-input": "required search_term_string",
          },
        }}
      />

      <HomeHero
        stats={stats}
        cities={cityOptions}
        images={heroImages}
        popularCategories={categories}
      />

      <TrustStrip />

      <div className="mx-auto max-w-7xl space-y-20 px-4 py-16">
        <CategoryGrid
          categories={categories}
          description="Every category is backed by verified suppliers with live product listings."
        />

        {topCity && popular ? (
          <div>
            <div className="mb-6 flex justify-end">
              <CityPicker
                current={null}
                cities={allCities.map((c) => ({ slug: c.slug, name: c.name }))}
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm shadow-sm"
              />
            </div>
            <PopularInCity city={topCity} popular={popular} />
          </div>
        ) : null}

        <PostRequirementCta />

        <HowItWorks />

        {content.products.length > 0 ? (
          <section>
            <SectionHeading
              eyebrow="Fresh listings"
              title="Latest products"
              description="Newly published by verified suppliers. Prices are indicative — ask for a quote."
              action={{ href: "/products", label: "View all products" }}
            />
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {content.products.map((product) => (
                <ProductResultCard key={product.id} hit={toProductHit(product)} />
              ))}
            </div>
          </section>
        ) : null}

        {content.sellers.length > 0 ? (
          <section>
            <SectionHeading
              eyebrow="Trusted suppliers"
              title="Top-rated businesses on Bzaro"
              description="Verified businesses with the strongest catalogues and buyer ratings."
              action={{ href: "/sellers", label: "Supplier directory" }}
            />
            <div className="mt-8 grid gap-4 lg:grid-cols-2">
              {content.sellers.map((seller) => (
                <SellerResultCard key={seller.id} hit={toSellerHit(seller)} />
              ))}
            </div>
          </section>
        ) : null}

        <StatsBand stats={stats} />

        <SellerCta />

        <Faq />

        <CityChips cities={popularCities} />
      </div>
    </>
  );
}
