import type { Metadata } from "next";
import Link from "next/link";
import { listPublishedPosts } from "@/server/services/blog.service";
import { BlogCard } from "@/components/blog/BlogCards";
import { MarketplaceBreadcrumbs } from "@/components/marketplace/ResultsPagination";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";
import { marketplaceUrl } from "@/lib/utils/url";

/**
 * Blog index (D45): buyer guides from the Bzaro team, newest first.
 * Page 2+ is reachable for people but kept out of the index; every article
 * is in the sitemap, so crawlers do not need the pagination.
 */

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const TRAIL = [
  { href: "/", label: "Home" },
  { href: "/blog", label: "Guides" },
];

function pageFrom(raw: string | string[] | undefined): number {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(value) && value > 1 && value < 500 ? value : 1;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const page = pageFrom((await searchParams).page);
  return {
    title: page > 1 ? `Buying guides – page ${page}` : "Buying guides for businesses",
    description:
      "Practical guides for business buyers in India: what to check before you order, how to compare suppliers, typical MOQs and specifications.",
    alternates: { canonical: marketplaceUrl(page > 1 ? `/blog?page=${page}` : "/blog") },
    robots: page > 1 ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: { type: "website", title: "Buying guides | Bzaro", url: marketplaceUrl("/blog") },
  };
}

export default async function BlogIndexPage({ searchParams }: Props) {
  const page = pageFrom((await searchParams).page);
  const { posts, pageCount } = await listPublishedPosts(page);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <JsonLd data={breadcrumbJsonLd(TRAIL, marketplaceUrl())} />
      <MarketplaceBreadcrumbs trail={TRAIL} />

      <header className="mb-8 max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-balance">
          Buying guides for businesses
        </h1>
        <p className="mt-2 text-neutral-600">
          What to check before you order, how to compare suppliers, and the specifications that
          matter — written by people who buy and sell these products.
        </p>
      </header>

      {posts.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-12 text-center text-neutral-600">
          The first guides are on their way.{" "}
          <Link href="/post-requirement" className="underline underline-offset-2">
            Tell us what you are looking for
          </Link>{" "}
          in the meantime.
        </p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <BlogCard key={post.id} post={post} />
          ))}
        </div>
      )}

      {pageCount > 1 ? (
        <nav aria-label="Pagination" className="mt-10 flex justify-between text-sm">
          {page > 1 ? (
            <Link
              href={page === 2 ? "/blog" : `/blog?page=${page - 1}`}
              className="underline underline-offset-2"
            >
              ← Newer guides
            </Link>
          ) : (
            <span />
          )}
          {page < pageCount ? (
            <Link href={`/blog?page=${page + 1}`} className="underline underline-offset-2">
              Older guides →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
