import type { Metadata } from "next";
import Link from "next/link";
import { requireSeller, scopeSurface } from "@/lib/auth/guards";
import { getCatalogCounts, listProducts } from "@/server/services/catalog.service";
import { CatalogList } from "@/components/dashboard/CatalogList";

export const metadata: Metadata = {
  title: "Products",
  robots: { index: false, follow: false },
};

export default async function ProductsPage() {
  const scope = await requireSeller();

  const [rows, counts] = await Promise.all([
    listProducts(scope.sellerId),
    getCatalogCounts(scope.sellerId),
  ]);

  return (
    <div className="max-w-4xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {counts.products === 0
              ? "Nothing here yet."
              : `${counts.publishedProducts} of ${counts.products} live on your website.`}
          </p>
        </div>

        <Link
          href="/dashboard/products/new"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Add a product
        </Link>
      </header>

      {/*
        The index-eligibility gate (D2) wants three published products. A seller
        with one or two is doing the right thing and still invisible to search,
        which is demoralising unless somebody says how far off they are.
      */}
      {counts.products > 0 && counts.publishedProducts < 3 ? (
        <p className="mb-6 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Publish {3 - counts.publishedProducts} more product
          {3 - counts.publishedProducts === 1 ? "" : "s"} (or 2 services) to let search engines
          index your website.
        </p>
      ) : null}

      {counts.awaitingReview > 0 ? (
        <p className="mb-6 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Some listings are waiting to be reviewed before they appear publicly. This normally takes
          less than a working day, and only applies until your first listing is approved.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center">
          <h2 className="font-medium">Add your first product</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-neutral-600">
            Products are what buyers search for. You can start with just a name and fill in prices,
            photographs and specifications later.
          </p>
          <Link
            href="/dashboard/products/new"
            className="mt-4 inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Add a product
          </Link>
        </div>
      ) : (
        <CatalogList
          kind="product"
          seller={scopeSurface(scope)}
          rows={rows.map((row) => ({
            ...row,
            imageUrl: row.images[0]?.url ?? null,
            imageAlt: row.images[0]?.alt ?? null,
          }))}
        />
      )}
    </div>
  );
}
