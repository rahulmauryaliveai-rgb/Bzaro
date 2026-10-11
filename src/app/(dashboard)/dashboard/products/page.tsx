import type { Metadata } from "next";
import Link from "next/link";
import { requireSeller, scopeSurface } from "@/lib/auth/guards";
import { getCatalogCounts, listProducts } from "@/server/services/catalog.service";
import { CatalogList } from "@/components/dashboard/CatalogList";
import { PublishSelected } from "@/components/dashboard/PublishSelected";
import { DownloadLink } from "@/components/dashboard/DownloadLink";

export const metadata: Metadata = {
  title: "Products",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ filter?: string; imported?: string; updated?: string; deleted?: string }>;
};

export default async function ProductsPage({ searchParams }: Props) {
  const scope = await requireSeller();
  const params = await searchParams;

  const [rows, counts] = await Promise.all([
    listProducts(scope.sellerId),
    getCatalogCounts(scope.sellerId),
  ]);

  const missingPhotos = rows.filter((row) => row._count.images === 0);
  const showingMissing = params.filter === "missing-photos";
  const visible = showingMissing ? missingPhotos : rows;

  const justImported = Number(params.imported ?? 0);
  const justUpdated = Number(params.updated ?? 0);

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

        <div className="flex flex-wrap gap-2">
          {/* Bulk upload first: a seller with a catalogue to load needs it
              more than they need the one-at-a-time form (D49). */}
          <Link
            href="/dashboard/products/import"
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
          >
            Bulk upload
          </Link>
          <Link
            href="/dashboard/products/new"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Add a product
          </Link>
        </div>
      </header>

      {justImported > 0 || justUpdated > 0 ? (
        <div className="mb-6 rounded-md bg-teal-50 px-3 py-3 text-sm text-teal-900" role="status">
          <p className="font-medium">
            {justImported > 0
              ? `${justImported} product${justImported === 1 ? "" : "s"} imported`
              : ""}
            {justImported > 0 && justUpdated > 0 ? " and " : ""}
            {justUpdated > 0 ? `${justUpdated} updated` : ""}.
          </p>
          <p className="mt-1">
            They are saved as drafts.{" "}
            <Link
              href="/dashboard/products/import/photos"
              className="font-medium underline underline-offset-2"
            >
              Add photos next
            </Link>
            , then publish them.
          </p>
        </div>
      ) : null}

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
        <EmptyState />
      ) : (
        <>
          <PublishSelected
            products={rows.map((row) => ({
              id: row.id,
              name: row.name,
              hasCategory: Boolean(row.categoryId),
              hasPhoto: row._count.images > 0,
              isDraft: row.status === "DRAFT",
            }))}
          />

          {/* ── Filters ── */}
          {missingPhotos.length > 0 ? (
            <nav className="mb-4 flex flex-wrap items-center gap-2" aria-label="Filter products">
              <FilterTab href="/dashboard/products" active={!showingMissing}>
                All {rows.length}
              </FilterTab>
              <FilterTab
                href="/dashboard/products?filter=missing-photos"
                active={showingMissing}
              >
                Missing photos {missingPhotos.length}
              </FilterTab>
            </nav>
          ) : null}

          {showingMissing ? (
            <p className="mb-4 rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-700">
              These products have no photo, so they cannot be published.{" "}
              <Link
                href="/dashboard/products/import/photos"
                className="font-medium underline underline-offset-2"
              >
                Upload photos in bulk
              </Link>{" "}
              by naming each file after its SKU.
            </p>
          ) : null}

          {visible.length === 0 ? (
            <p className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-600">
              Every product has a photo. Nothing to fix here.
            </p>
          ) : (
            <CatalogList
              kind="product"
              seller={scopeSurface(scope)}
              rows={visible.map((row) => ({
                ...row,
                imageUrl: row.images[0]?.url ?? null,
                imageAlt: row.images[0]?.alt ?? null,
              }))}
            />
          )}
        </>
      )}
    </div>
  );
}

function FilterTab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full px-3 py-1.5 text-xs font-medium ${
        active
          ? "bg-neutral-900 text-white"
          : "border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
      }`}
    >
      {children}
    </Link>
  );
}

/**
 * The empty products page.
 *
 * Bulk upload is offered here, not only on the list: a seller with a hundred
 * products to load arrives at an empty page, and if the only thing on it is
 * "Add a product" they will start typing the first one by hand — and stop
 * after four (D49).
 */
function EmptyState() {
  return (
    <div className="space-y-4">
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

      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-6">
        <h2 className="font-medium">Have many products? Upload them with Excel</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Fill one row per product in our Excel file and upload it — up to 1000 products at a time.
          Then name your photos after each product code and upload them all together.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/dashboard/products/import"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Start bulk upload
          </Link>
          <DownloadLink href="/dashboard/products/import/template">
            Download template
          </DownloadLink>
          <DownloadLink href="/dashboard/products/import/template?demo=1">
            See a filled example
          </DownloadLink>
        </div>
      </div>
    </div>
  );
}
