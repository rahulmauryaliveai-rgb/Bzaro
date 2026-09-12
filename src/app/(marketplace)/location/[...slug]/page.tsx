import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { search } from "@/lib/search";
import { parseSearchParams, RESULTS_PER_PAGE, buildSearchQuery } from "@/lib/validation/search";
import { categoryIdFromPath, getLocationByPath } from "@/server/services/taxonomy.service";
import { SellerResultCard } from "@/components/marketplace/ResultCards";
import {
  MarketplaceBreadcrumbs,
  ResultsPagination,
} from "@/components/marketplace/ResultsPagination";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";
import { marketplaceUrl } from "@/lib/utils/url";
import { clientEnv } from "@/env.client";
import { db } from "@/lib/db";

/**
 * Location pages.
 *
 * "Steel suppliers in Mumbai" is how B2B buyers actually search, so location is
 * a first-class discovery axis rather than just a filter.
 *
 * These pages list SUPPLIERS rather than products. A city page full of
 * individual SKUs is not what the query intends — the buyer is choosing who to
 * deal with, and will narrow to products once they have a shortlist.
 */

type Props = {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, rawQuery] = await Promise.all([params, searchParams]);
  const location = await getLocationByPath(slug);

  if (!location) return { title: "Location not found", robots: { index: false, follow: false } };

  const query = parseSearchParams(rawQuery);
  const platform = clientEnv.NEXT_PUBLIC_PLATFORM_NAME;

  return {
    title: location.metaTitle ?? `Suppliers and manufacturers in ${location.name}`,
    description:
      location.metaDescription ??
      `Find verified suppliers, manufacturers and service providers in ${location.name} on ${platform}.`,
    alternates: { canonical: marketplaceUrl(`/location/${slug.join("/")}`) },
    robots: query.page > 5 ? { index: false, follow: true } : { index: true, follow: true },
  };
}

export default async function LocationPage({ params, searchParams }: Props) {
  const [{ slug }, rawQuery] = await Promise.all([params, searchParams]);
  const location = await getLocationByPath(slug);

  if (!location) notFound();

  const query = parseSearchParams(rawQuery);
  const categoryId = await categoryIdFromPath(query.category);

  const [ancestors, children, results] = await Promise.all([
    location.ancestorIds.length > 0
      ? db.location.findMany({
          where: { id: { in: location.ancestorIds } },
          select: { id: true, name: true, path: true },
        })
      : Promise.resolve([]),
    db.location.findMany({
      where: { parentId: location.id, isActive: true },
      select: { id: true, name: true, path: true },
      orderBy: [{ sellerCount: "desc" }, { name: "asc" }],
      take: 30,
    }),
    search.searchSellers({
      locationId: location.id,
      categoryId,
      query: query.q,
      verifiedOnly: query.verifiedOnly,
      sort: query.sort,
      page: query.page,
      perPage: RESULTS_PER_PAGE,
    }),
  ]);

  const basePath = `/location/${slug.join("/")}`;

  const trail = [
    { href: "/", label: "Home" },
    ...ancestors.map((node) => ({ href: `/location${node.path}`, label: node.name })),
    { href: basePath, label: location.name },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <JsonLd data={breadcrumbJsonLd(trail, marketplaceUrl())} />

      <MarketplaceBreadcrumbs trail={trail} />

      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-balance">
          Suppliers in {location.name}
        </h1>
        <p className="mt-2 text-neutral-600">
          <span className="tabular-nums">{results.total}</span> verified supplier
          {results.total === 1 ? "" : "s"}
        </p>
      </header>

      {children.length > 0 ? (
        <nav aria-label="Areas" className="mb-8">
          <ul className="flex flex-wrap gap-2">
            {children.map((child) => (
              <li key={child.id}>
                <Link
                  href={`/location${child.path}`}
                  className="inline-block rounded-full border border-neutral-300 px-3.5 py-1.5 text-sm hover:bg-neutral-50"
                >
                  {child.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <div className="mb-5">
        <Link
          href={`/search${buildSearchQuery({ location: slug.join("/"), mode: "sellers" })}`}
          className="text-sm text-neutral-600 underline underline-offset-2 hover:text-neutral-900"
        >
          Refine with filters
        </Link>
      </div>

      {results.total === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 p-12 text-center">
          <p className="font-medium">No suppliers listed here yet</p>
          <Link
            href="/sellers"
            className="mt-4 inline-block rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
          >
            Browse all suppliers
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {results.hits.map((hit) => (
            <SellerResultCard key={hit.id} hit={hit} />
          ))}
        </div>
      )}

      <ResultsPagination params={query} pageCount={results.pageCount} basePath={basePath} />
    </div>
  );
}
