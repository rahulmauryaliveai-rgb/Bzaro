import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCategoryGrid,
  getCityBySlug,
  getPopularInCity,
} from "@/server/services/discovery.service";
import { getAllCities } from "@/server/services/taxonomy.service";
import { CityPicker } from "@/components/marketplace/CityPicker";
import {
  CategoryGrid,
  PopularInCity,
  PostRequirementCta,
} from "@/components/marketplace/Discovery";
import { MarketplaceBreadcrumbs } from "@/components/marketplace/ResultsPagination";
import { SearchBar } from "@/components/marketplace/SearchBar";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";
import { marketplaceUrl } from "@/lib/utils/url";
import { clientEnv } from "@/env.client";

/**
 * City landing page: /mumbai
 *
 * ── A root-level dynamic segment, guarded (decision D30) ─────────────────────
 * D20 rejected `app/[tenant]` because an unknown path would render a tenant
 * site. This segment is different in kind: the value is checked against the
 * Location table and anything else is a plain 404, so `/anything` can never
 * render content it should not. Static routes (/search, /sellers, /category…)
 * take precedence over this segment, exactly as before.
 *
 * ISR: one render per city per hour, purged early by revalidateSellerDiscovery.
 */

export const revalidate = 3600;
export const dynamicParams = true;

type Props = { params: Promise<{ city: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city: slug } = await params;
  const city = await getCityBySlug(slug);
  if (!city) return { title: "Not found", robots: { index: false, follow: false } };

  const platform = clientEnv.NEXT_PUBLIC_PLATFORM_NAME;
  return {
    title: `Suppliers and manufacturers in ${city.name}`,
    description: `Find verified suppliers, wholesalers and manufacturers in ${city.name} on ${platform}. Browse by category, compare products and contact suppliers directly.`,
    alternates: { canonical: marketplaceUrl(`/${city.slug}`) },
  };
}

export default async function CityPage({ params }: Props) {
  const { city: slug } = await params;
  const city = await getCityBySlug(slug);
  if (!city) notFound();

  const [popular, categories, cities] = await Promise.all([
    getPopularInCity(city.id),
    getCategoryGrid(),
    getAllCities(),
  ]);

  const trail = [
    { href: "/", label: "Home" },
    { href: `/${city.slug}`, label: city.name },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <JsonLd data={breadcrumbJsonLd(trail, marketplaceUrl())} />
      <MarketplaceBreadcrumbs trail={trail} />

      <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Suppliers in {city.name}</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {city.parent ? `${city.parent.name} · ` : ""}
            <span className="tabular-nums">{popular.sellerTotal}</span> verified supplier
            {popular.sellerTotal === 1 ? "" : "s"}
          </p>
        </div>
        <CityPicker
          cities={cities.map((c) => ({ slug: c.slug, name: c.name }))}
          current={city.slug}
        />
      </header>

      <div className="mt-6 max-w-2xl">
        <SearchBar
          id="city-search"
          hidden={{ location: city.path }}
          placeholder={`Search products and suppliers in ${city.name}…`}
        />
      </div>

      <div className="mt-12 space-y-14">
        <PopularInCity city={city} popular={popular} showHeading={false} />
        <CategoryGrid
          categories={categories}
          citySlug={city.slug}
          title={`Categories in ${city.name}`}
        />
        <PostRequirementCta />
        <p className="text-sm text-neutral-500">
          Looking for a supplier who delivers to {city.name} from elsewhere?{" "}
          <Link
            href={`/sellers?location=${encodeURIComponent(city.path)}`}
            className="underline underline-offset-2"
          >
            Browse the full directory
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
