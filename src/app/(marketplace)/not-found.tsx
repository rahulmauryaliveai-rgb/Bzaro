import type { Metadata } from "next";
import Link from "next/link";
import { SearchBar } from "@/components/marketplace/SearchBar";
import { getCategoryGrid } from "@/server/services/discovery.service";

/**
 * 404 for the marketplace.
 *
 * A dead end costs a buyer who arrived from an old link or a typo. This page
 * says plainly that the page is gone, then offers the three ways forward a
 * buyer actually uses: search, browse a category, or post a requirement.
 * Served with a 404 status and `noindex`, and no canonical of its own.
 */

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

export default async function MarketplaceNotFound() {
  const categories = await getCategoryGrid().catch(() => []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center">
      <p className="text-sm font-medium tracking-wide text-neutral-500 uppercase">Error 404</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance">
        We couldn&apos;t find that page
      </h1>
      <p className="mx-auto mt-3 max-w-xl text-neutral-600">
        The link may be old, or the listing may have been removed. Search for what you need, or pick
        a category below.
      </p>

      <div className="mx-auto mt-8 max-w-xl text-left">
        <SearchBar placeholder="Search products or suppliers" id="not-found-search" />
      </div>

      {categories.length > 0 ? (
        <nav aria-label="Categories" className="mt-10">
          <h2 className="text-sm font-semibold tracking-wide text-neutral-500 uppercase">
            Browse categories
          </h2>
          <ul className="mt-4 flex flex-wrap justify-center gap-2">
            {categories.slice(0, 12).map((category) => (
              <li key={category.id}>
                <Link
                  href={`/category${category.path}`}
                  className="inline-block rounded-full border border-neutral-300 px-3.5 py-1.5 text-sm hover:bg-neutral-50"
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <p className="mt-10 text-sm text-neutral-600">
        Can&apos;t find a supplier?{" "}
        <Link href="/post-requirement" className="font-medium underline underline-offset-2">
          Post your requirement
        </Link>{" "}
        and matching suppliers will contact you. Or go back to the{" "}
        <Link href="/" className="underline underline-offset-2">
          homepage
        </Link>
        .
      </p>
    </div>
  );
}
