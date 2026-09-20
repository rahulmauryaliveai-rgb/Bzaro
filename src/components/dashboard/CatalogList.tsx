import Link from "next/link";
import { setCatalogStatusAction } from "@/server/actions/catalog";
import { formatPrice } from "@/lib/utils/money";
import { sellerSiteUrl, type SellerSurface } from "@/lib/utils/url";
import { SiteImage } from "@/components/site/sections/SiteImage";

/**
 * The catalogue list for products or services.
 *
 * ── Why status is spelled out rather than shown as a dot ─────────────────────
 * An item can be invisible to buyers for two unrelated reasons: the seller has
 * not published it, or it is waiting for review (D10). Those need different
 * actions from the seller — publish it, or wait — so collapsing both into one
 * "not live" indicator would leave them pressing the wrong button.
 *
 * A server component: the only interactive parts are plain form buttons, which
 * work without JavaScript.
 */

export type CatalogRow = {
  id: string;
  slug: string;
  name: string;
  status: string;
  moderationStatus: string;
  priceMinor: number | null;
  priceMaxMinor?: number | null;
  currency: string;
  unit?: string | null;
  priceOnRequest: boolean;
  enquiryCount: number;
  viewCount: number;
  category: { name: string } | null;
  imageUrl?: string | null;
  imageAlt?: string | null;
};

function Badge({
  tone,
  children,
}: {
  tone: "live" | "draft" | "review" | "archived";
  children: React.ReactNode;
}) {
  const classes = {
    live: "bg-teal-50 text-teal-800",
    draft: "bg-neutral-100 text-neutral-700",
    review: "bg-amber-50 text-amber-900",
    archived: "bg-neutral-100 text-neutral-500",
  }[tone];

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${classes}`}>
      {children}
    </span>
  );
}

function statusBadge(row: CatalogRow) {
  if (row.status === "ARCHIVED") return <Badge tone="archived">Archived</Badge>;
  if (row.status === "DRAFT") return <Badge tone="draft">Draft</Badge>;

  // Published but not yet approved: live to nobody. Saying "Published" here
  // would be a lie the seller only discovers by visiting their own site.
  if (row.moderationStatus !== "APPROVED") return <Badge tone="review">Awaiting review</Badge>;

  return <Badge tone="live">Live</Badge>;
}

export function CatalogList({
  kind,
  rows,
  seller,
}: {
  kind: "product" | "service";
  rows: CatalogRow[];
  /** Slug + web-presence tier: the "view" link goes to the site or, on the catalogue tier, to Bzaro (D32). */
  seller: SellerSurface;
}) {
  const basePath = kind === "product" ? "/dashboard/products" : "/dashboard/services";
  const publicPath = kind === "product" ? "products" : "services";

  return (
    <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
      {rows.map((row) => {
        const live = row.status === "PUBLISHED" && row.moderationStatus === "APPROVED";

        return (
          <li key={row.id} className="flex flex-wrap items-center gap-4 p-4">
            {row.imageUrl ? (
              <SiteImage
                src={row.imageUrl}
                alt={row.imageAlt ?? ""}
                width={56}
                height={56}
                className="h-14 w-14 shrink-0 rounded object-cover"
              />
            ) : (
              <div className="h-14 w-14 shrink-0 rounded bg-neutral-100" aria-hidden="true" />
            )}

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`${basePath}/${row.id}`} className="font-medium hover:underline">
                  {row.name}
                </Link>
                {statusBadge(row)}
              </div>

              <p className="mt-0.5 text-sm text-neutral-600">
                {formatPrice({
                  minor: row.priceMinor,
                  maxMinor: row.priceMaxMinor ?? null,
                  currency: row.currency,
                  unit: row.unit ?? null,
                  onRequest: row.priceOnRequest,
                })}
                {row.category ? ` · ${row.category.name}` : ""}
              </p>

              <p className="mt-0.5 text-xs text-neutral-500">
                {row.viewCount} views · {row.enquiryCount} enquiries
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {live ? (
                <a
                  href={sellerSiteUrl(seller, `/${publicPath}/${row.slug}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-teal-700 underline underline-offset-2"
                >
                  View ↗
                </a>
              ) : null}

              <form action={setCatalogStatusAction}>
                <input type="hidden" name="kind" value={kind} />
                <input type="hidden" name="id" value={row.id} />
                <input
                  type="hidden"
                  name="status"
                  value={row.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED"}
                />
                <button
                  type="submit"
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-50"
                >
                  {row.status === "PUBLISHED" ? "Unpublish" : "Publish"}
                </button>
              </form>

              <Link
                href={`${basePath}/${row.id}`}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-50"
              >
                Edit
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
