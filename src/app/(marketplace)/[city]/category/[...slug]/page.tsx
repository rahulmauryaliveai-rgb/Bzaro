import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCityBySlug, getCityCategoryListing } from "@/server/services/discovery.service";
import {
  getCategoryAncestors,
  getCategoryByPath,
  getCategoryChildren,
} from "@/server/services/taxonomy.service";
import { ProductResultCard, SellerResultCard } from "@/components/marketplace/ResultCards";
import { toProductHit, toSellerHit } from "@/components/marketplace/hits";
import { MarketplaceBreadcrumbs } from "@/components/marketplace/ResultsPagination";
import { PostRequirementCta } from "@/components/marketplace/Discovery";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd, itemListJsonLd } from "@/lib/seo/jsonld";
import { marketplaceUrl } from "@/lib/utils/url";
import { clientEnv } from "@/env.client";

/**
 * City × category listing: /mumbai/category/electronics/lighting/led-bulbs
 *
 * The page buyers actually want ("LED bulb suppliers in Mumbai") and the page
 * search engines rank. ISR, page 1 only: the paginated, filterable version is
 * the dynamic /category page with ?location=, linked from the bottom.
 *
 * Category paths mirror /category/[...slug] so every existing category link
 * gains a city variant by prefixing the city slug.
 */

export const revalidate = 3600;
export const dynamicParams = true;

type Props = { params: Promise<{ city: string; slug: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city: citySlug, slug } = await params;
  const [city, category] = await Promise.all([getCityBySlug(citySlug), getCategoryByPath(slug)]);
  if (!city || !category) return { title: "Not found", robots: { index: false, follow: false } };

  const platform = clientEnv.NEXT_PUBLIC_PLATFORM_NAME;
  return {
    title: `${category.name} suppliers in ${city.name}`,
    description: `Verified ${category.name.toLowerCase()} suppliers, wholesalers and manufacturers in ${city.name} on ${platform}. Compare products and get the best price on WhatsApp.`,
    alternates: { canonical: marketplaceUrl(`/${city.slug}/category${category.path}`) },
  };
}

export default async function CityCategoryPage({ params }: Props) {
  const { city: citySlug, slug } = await params;
  const [city, category] = await Promise.all([getCityBySlug(citySlug), getCategoryByPath(slug)]);
  if (!city || !category) notFound();

  const [listing, ancestors, children] = await Promise.all([
    getCityCategoryListing(city.id, category.id),
    getCategoryAncestors(category.ancestorIds),
    getCategoryChildren(category.id),
  ]);

  const trail = [
    { href: "/", label: "Home" },
    { href: `/${city.slug}`, label: city.name },
    ...ancestors.map((a) => ({ href: `/${city.slug}/category${a.path}`, label: a.name })),
    { href: `/${city.slug}/category${category.path}`, label: category.name },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <JsonLd
        data={[
          breadcrumbJsonLd(trail, marketplaceUrl()),
          itemListJsonLd(
            listing.sellers.map((s) => ({ name: s.businessName, href: `/seller/${s.slug}` })),
            marketplaceUrl(),
          ),
        ]}
      />
      <MarketplaceBreadcrumbs trail={trail} />

      <header className="mt-4">
        <h1 className="text-3xl font-semibold tracking-tight">
          {category.name} suppliers in {city.name}
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          <span className="tabular-nums">{listing.sellerTotal}</span> verified supplier
          {listing.sellerTotal === 1 ? "" : "s"}
          {" · "}
          <Link href={`/category${category.path}`} className="underline underline-offset-2">
            All of India
          </Link>
        </p>
      </header>

      {children.length > 0 ? (
        <ul className="mt-5 flex flex-wrap gap-2">
          {children.map((child) => (
            <li key={child.id}>
              <Link
                href={`/${city.slug}/category${child.path}`}
                className="inline-block rounded-full border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50"
              >
                {child.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {listing.sellers.length === 0 ? (
        <div className="mt-10 rounded-lg border border-dashed border-neutral-300 p-10 text-center">
          <p className="font-medium">
            No {category.name.toLowerCase()} suppliers in {city.name} yet
          </p>
          <p className="mt-2 text-sm text-neutral-600">
            Post your requirement and we will match you with suppliers who deliver to {city.name}.
          </p>
          <div className="mt-4">
            <PostRequirementCta compact />
          </div>
        </div>
      ) : (
        <section className="mt-8">
          <h2 className="mb-4 text-lg font-semibold">Suppliers</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {listing.sellers.map((seller) => (
              <SellerResultCard key={seller.id} hit={toSellerHit(seller)} />
            ))}
          </div>
          {listing.sellerTotal > listing.sellers.length ? (
            <p className="mt-4 text-sm">
              <Link
                href={`/sellers?category=${encodeURIComponent(category.path)}&location=${encodeURIComponent(city.path)}`}
                className="underline underline-offset-2"
              >
                See all {listing.sellerTotal} suppliers
              </Link>
            </p>
          ) : null}
        </section>
      )}

      {listing.products.length > 0 ? (
        <section className="mt-12">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 className="text-lg font-semibold">Products</h2>
            <Link
              href={`/category${category.path}?location=${encodeURIComponent(city.path)}`}
              className="text-sm text-neutral-600 underline underline-offset-2 hover:text-neutral-900"
            >
              Filter and sort
            </Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {listing.products.map((product) => (
              <ProductResultCard key={product.id} hit={toProductHit(product)} />
            ))}
          </div>
        </section>
      ) : null}

      <div className="mt-14">
        <PostRequirementCta />
      </div>
    </div>
  );
}
