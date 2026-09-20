import Link from "next/link";
import { ArrowRight, ClipboardList } from "lucide-react";
import { SectionHeading } from "@/components/marketplace/Home";
import { ProductResultCard, SellerResultCard } from "@/components/marketplace/ResultCards";
import { toProductHit, toSellerHit } from "@/components/marketplace/hits";
import type { getCategoryGrid, getPopularInCity } from "@/server/services/discovery.service";

/**
 * Discovery page sections. Server components: the data arrives already
 * cached and tagged from discovery.service, and nothing here reads a cookie
 * or a header, which is what keeps the pages ISR.
 */

type CategoryGridItem = Awaited<ReturnType<typeof getCategoryGrid>>[number];
type Popular = Awaited<ReturnType<typeof getPopularInCity>>;

/** Root categories as image tiles. Links go to the city-scoped listing when a city is known. */
export function CategoryGrid({
  categories,
  citySlug,
  title = "Browse by category",
  description,
}: {
  categories: CategoryGridItem[];
  citySlug?: string | null;
  title?: string;
  description?: string;
}) {
  if (categories.length === 0) return null;
  return (
    <section>
      <SectionHeading
        eyebrow="Categories"
        title={title}
        description={description}
        action={{ href: "/search", label: "All categories" }}
      />
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {categories.map((category) => (
          <li key={category.id}>
            <Link
              href={
                citySlug ? `/${citySlug}/category${category.path}` : `/category${category.path}`
              }
              className="group hover:border-brand-300 hover:shadow-brand-900/5 flex h-full items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-3 pr-4 transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <span className="bg-brand-50 relative h-20 w-20 shrink-0 overflow-hidden rounded-xl">
                {category.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={category.imageUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <span className="text-brand-300 flex h-full w-full items-center justify-center text-2xl font-bold">
                    {category.name.charAt(0)}
                  </span>
                )}
              </span>
              <span className="min-w-0">
                <span className="group-hover:text-brand-700 block font-semibold text-neutral-900">
                  {category.name}
                </span>
                <span className="mt-0.5 block text-sm text-neutral-500 tabular-nums">
                  {category.sellerCount} supplier{category.sellerCount === 1 ? "" : "s"}
                  {category.productCount > 0 ? ` · ${category.productCount} products` : ""}
                </span>
                <span className="text-brand-700 mt-1.5 inline-flex items-center gap-1 text-xs font-medium opacity-0 transition-opacity group-hover:opacity-100">
                  Explore <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "Popular in <city>": categories → suppliers → products. */
export function PopularInCity({
  city,
  popular,
  showHeading = true,
}: {
  city: { slug: string; name: string };
  popular: Popular;
  showHeading?: boolean;
}) {
  const empty =
    popular.sellers.length === 0 &&
    popular.products.length === 0 &&
    popular.categories.length === 0;

  return (
    <section>
      {showHeading ? (
        <div className="mb-8">
          <SectionHeading
            eyebrow="Near you"
            title={`Popular in ${city.name}`}
            description={`Top suppliers, categories and the newest products listed in ${city.name}.`}
            action={{ href: `/${city.slug}`, label: `Everything in ${city.name}` }}
          />
        </div>
      ) : null}

      {empty ? (
        <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-600">
          <p>No suppliers listed in {city.name} yet.</p>
          <p className="mt-2">
            <Link
              href="/post-requirement"
              className="text-brand-700 font-medium underline underline-offset-2"
            >
              Post your requirement
            </Link>{" "}
            and we will match you with suppliers who deliver here.
          </p>
        </div>
      ) : null}

      {popular.categories.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {popular.categories.map((category) => (
            <li key={category.id}>
              <Link
                href={`/${city.slug}/category${category.path}`}
                className="border-brand-200 bg-brand-50 text-brand-800 hover:border-brand-400 hover:bg-brand-100 inline-block rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors"
              >
                {category.name}{" "}
                <span className="text-brand-500 tabular-nums">{category.sellerCount}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {popular.sellers.length > 0 ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {popular.sellers.map((seller) => (
            <SellerResultCard key={seller.id} hit={toSellerHit(seller)} />
          ))}
        </div>
      ) : null}

      {popular.products.length > 0 ? (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {popular.products.map((product) => (
            <ProductResultCard key={product.id} hit={toProductHit(product)} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

/** The market-only entry point: no seller, just a requirement. */
export function PostRequirementCta({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <Link
        href="/post-requirement"
        className="bg-accent-600 hover:bg-accent-700 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white"
      >
        <ClipboardList className="h-4 w-4" aria-hidden="true" />
        Post requirement
      </Link>
    );
  }
  return (
    <section className="bg-brand-700 relative overflow-hidden rounded-3xl p-8 text-white sm:flex sm:items-center sm:justify-between sm:gap-8 lg:p-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(30,164,79,0.45),transparent_55%)]"
      />
      <div className="relative">
        <p className="text-brand-100 text-xs font-semibold tracking-wide uppercase">
          Can&apos;t find it?
        </p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-balance sm:text-3xl">
          Tell us what you need. Suppliers come to you.
        </h2>
        <p className="text-brand-100 mt-2 max-w-xl">
          Post a requirement once — up to 10 verified suppliers in your category and city receive it
          and reply on WhatsApp.
        </p>
      </div>
      <Link
        href="/post-requirement"
        className="bg-accent-600 hover:bg-accent-500 relative mt-6 inline-flex shrink-0 items-center gap-2 rounded-xl px-6 py-3 font-semibold text-white shadow-lg shadow-black/20 transition-all hover:-translate-y-0.5 sm:mt-0"
      >
        <ClipboardList className="h-5 w-5" aria-hidden="true" />
        Post requirement
      </Link>
    </section>
  );
}

/** City chips. Links go to the city landing page. */
export function CityChips({
  cities,
  title = "Browse by city",
}: {
  cities: { id: string; slug: string; name: string }[];
  title?: string;
}) {
  if (cities.length === 0) return null;
  return (
    <section>
      <SectionHeading eyebrow="Cities" title={title} />
      <ul className="mt-6 flex flex-wrap gap-2">
        {cities.map((city) => (
          <li key={city.id}>
            <Link
              href={`/${city.slug}`}
              className="hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800 inline-block rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors"
            >
              {city.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
