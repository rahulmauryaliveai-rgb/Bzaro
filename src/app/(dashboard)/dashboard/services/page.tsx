import type { Metadata } from "next";
import Link from "next/link";
import { requireSeller } from "@/lib/auth/guards";
import { getCatalogCounts, listServices } from "@/server/services/catalog.service";
import { CatalogList } from "@/components/dashboard/CatalogList";
import { tenantUrl } from "@/lib/utils/url";

export const metadata: Metadata = {
  title: "Services",
  robots: { index: false, follow: false },
};

export default async function ServicesPage() {
  const scope = await requireSeller();

  const [rows, counts] = await Promise.all([
    listServices(scope.sellerId),
    getCatalogCounts(scope.sellerId),
  ]);

  return (
    <div className="max-w-4xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Services</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {counts.services === 0
              ? "Nothing here yet."
              : `${counts.publishedServices} of ${counts.services} live on your website.`}
          </p>
        </div>

        <Link
          href="/dashboard/services/new"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Add a service
        </Link>
      </header>

      {/* Two published services clear the D2 gate on their own (no products). */}
      {counts.services > 0 && counts.publishedServices < 2 ? (
        <p className="mb-6 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Publish {2 - counts.publishedServices} more service
          {2 - counts.publishedServices === 1 ? "" : "s"} (or 3 products) to let search engines
          index your website.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center">
          <h2 className="font-medium">Add your first service</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-neutral-600">
            If you do work rather than sell stock — installation, fabrication, consulting — list
            it here. Two published services are enough to get your website into search results.
          </p>
          <Link
            href="/dashboard/services/new"
            className="mt-4 inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Add a service
          </Link>
        </div>
      ) : (
        <CatalogList
          kind="service"
          tenantUrl={tenantUrl(scope.sellerSlug)}
          rows={rows.map((row) => ({ ...row, imageUrl: row.imageUrl, imageAlt: row.name }))}
        />
      )}
    </div>
  );
}
