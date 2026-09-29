import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { search } from "@/lib/search";
import { parseSearchParams, RESULTS_PER_PAGE, buildSearchQuery } from "@/lib/validation/search";
import {
  getCategoryAncestors,
  getCategoryByPath,
  getCategoryChildren,
  locationIdFromPath,
} from "@/server/services/taxonomy.service";
import { ProductResultCard } from "@/components/marketplace/ResultCards";
import {
  MarketplaceBreadcrumbs,
  ResultsPagination,
} from "@/components/marketplace/ResultsPagination";
import { SortSelect } from "@/components/marketplace/SortSelect";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd, itemListJsonLd } from "@/lib/seo/jsonld";
import { marketplaceUrl } from "@/lib/utils/url";
import { categorySeoDescription, categorySeoTitle } from "@/lib/seo/templates";
import { getCategoryCities, getCategoryContentCount } from "@/server/services/seo.service";
import { getCategorySuppliers } from "@/server/services/discovery.service";
import { getPostsForCategory } from "@/server/services/blog.service";
import { RelatedArticles } from "@/components/blog/BlogCards";
import { parseFaqs } from "@/lib/validation/seo";
import { RichText } from "@/components/shared/RichText";
import { toSellerHit } from "@/components/marketplace/hits";
import {
  CategoryCities,
  CategoryFaqs,
  CategorySuppliers,
} from "@/components/marketplace/CategorySections";

/**
 * Category pages.
 *
 * These are the marketplace's ranking surface (decision D1): the marketplace is
 * canonical for aggregate discovery, and "LED panel suppliers" is exactly the
 * kind of query a category page should own rather than a filtered search URL.
 *
 * Which is why search permutations are `noindex` while these are not — they are
 * stable, curated, editorially describable, and there is one per real category
 * rather than one per filter combination.
 */

type Props = {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, rawQuery] = await Promise.all([params, searchParams]);
  const category = await getCategoryByPath(slug);

  if (!category) return { title: "Category not found", robots: { index: false, follow: false } };

  const query = parseSearchParams(rawQuery);
  const path = `/category/${slug.join("/")}`;
  const [count, cities] = await Promise.all([
    getCategoryContentCount(category.id),
    getCategoryCities(category.id, 3),
  ]);
  const seo = {
    name: category.name,
    metaTitle: category.metaTitle,
    metaDescription: category.metaDescription,
    description: category.description,
    productCount: count.products,
    cities: cities.map((city) => city.name),
  };
  // An empty category is thin content (D44): kept out of the index until
  // something is listed under it, but its links are still followed. Deep
  // pagination is left out for the same reason.
  const indexable = count.total > 0 && query.page <= 5 && !category.noindex;
  const shareImage = category.ogImageUrl ?? category.imageUrl;

  return {
    title: categorySeoTitle(seo),
    description: categorySeoDescription(seo),
    // Canonical drops pagination and filters so page 2 does not compete with
    // page 1 for the same term.
    alternates: { canonical: marketplaceUrl(path) },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      type: "website",
      title: categorySeoTitle(seo),
      description: categorySeoDescription(seo),
      url: marketplaceUrl(path),
      ...(shareImage ? { images: [shareImage] } : {}),
    },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const [{ slug }, rawQuery] = await Promise.all([params, searchParams]);
  const category = await getCategoryByPath(slug);

  if (!category) notFound();

  const query = parseSearchParams(rawQuery);
  const locationId = await locationIdFromPath(query.location);

  const [ancestors, children, results, suppliers, cities, guides] = await Promise.all([
    getCategoryAncestors(category.ancestorIds),
    getCategoryChildren(category.id),
    search.searchProducts({
      categoryId: category.id,
      locationId,
      query: query.q,
      minPriceMinor: query.minPrice !== undefined ? query.minPrice * 100 : undefined,
      maxPriceMinor: query.maxPrice !== undefined ? query.maxPrice * 100 : undefined,
      pricedOnly: query.pricedOnly,
      verifiedOnly: query.verifiedOnly,
      sort: query.sort,
      page: query.page,
      perPage: RESULTS_PER_PAGE,
    }),
    getCategorySuppliers(category.id, 8),
    getCategoryCities(category.id, 12),
    getPostsForCategory(category.id, category.ancestorIds, 3),
  ]);
  // Intro, suppliers, cities and FAQs belong to the page itself, not to every
  // filtered or paginated variant — repeating them there is duplicate content.
  const isLanding =
    query.page === 1 &&
    !query.q &&
    !query.location &&
    query.minPrice === undefined &&
    query.maxPrice === undefined;
  const faqs = parseFaqs(category.faqs);

  const basePath = `/category/${slug.join("/")}`;

  const trail = [
    { href: "/", label: "Home" },
    ...ancestors.map((node) => ({ href: `/category${node.path}`, label: node.name })),
    { href: basePath, label: category.name },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <JsonLd
        data={[
          breadcrumbJsonLd(trail, marketplaceUrl()),
          itemListJsonLd(
            results.hits.map((hit) => ({
              name: hit.name,
              href: `/product/${hit.sellerSlug}/${hit.slug}`,
            })),
            marketplaceUrl(),
          ),
        ]}
      />

      <MarketplaceBreadcrumbs trail={trail} />

      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-balance">{category.name}</h1>
        <p className="mt-2 text-neutral-600">
          <span className="tabular-nums">{results.total}</span> product
          {results.total === 1 ? "" : "s"} from verified suppliers
        </p>
        {isLanding && category.description ? (
          <RichText
            text={category.description}
            className="mt-3 max-w-3xl space-y-3 leading-relaxed text-neutral-700"
          />
        ) : null}
      </header>

      {/* Subcategories come before results: a buyer who landed on "Lighting"
          usually wants to narrow before they browse 400 items. */}
      {children.length > 0 ? (
        <nav aria-label="Subcategories" className="mb-8">
          <ul className="flex flex-wrap gap-2">
            {children.map((child) => (
              <li key={child.id}>
                <Link
                  href={`/category${child.path}`}
                  className="inline-block rounded-full border border-neutral-300 px-3.5 py-1.5 text-sm hover:bg-neutral-50"
                >
                  {child.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/search${buildSearchQuery({ category: slug.join("/") })}`}
          className="text-sm text-neutral-600 underline underline-offset-2 hover:text-neutral-900"
        >
          Refine with filters
        </Link>
        <SortSelect value={query.sort} action={basePath} />
      </div>

      {results.total === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 p-12 text-center">
          <p className="font-medium">No products listed in this category yet</p>
          <Link
            href="/search"
            className="mt-4 inline-block rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
          >
            Browse everything
          </Link>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {results.hits.map((hit) => (
            <ProductResultCard key={hit.id} hit={hit} />
          ))}
        </div>
      )}

      <ResultsPagination params={query} pageCount={results.pageCount} basePath={basePath} />

      {isLanding ? (
        <>
          <CategorySuppliers
            categoryName={category.name}
            categoryPath={category.path}
            sellers={suppliers.sellers.map(toSellerHit)}
            total={suppliers.total}
          />
          <CategoryCities
            categoryName={category.name}
            categoryPath={category.path}
            cities={cities}
          />
          <CategoryFaqs faqs={faqs} />
          <RelatedArticles title={`${category.name} buying guides`} posts={guides} />
        </>
      ) : null}
    </div>
  );
}
