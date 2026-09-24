import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { sellerVisitUrl } from "@/lib/utils/url";

export const metadata: Metadata = {
  title: "Saved suppliers",
  robots: { index: false, follow: false },
};

/**
 * The buyer's saved suppliers (Phase 7).
 *
 * Sorted newest-first, which is what "I was just looking at this" expects.
 * Suppliers that have since been suspended or deleted simply stop appearing —
 * the row is cascaded away with the seller, so there is nothing to clean up.
 */
export default async function SavedSellersPage() {
  const user = await requireUser("/account/saved");

  const saved = await db.savedSeller.findMany({
    where: { buyerId: user.id, seller: { status: "VERIFIED", deletedAt: null } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      createdAt: true,
      seller: {
        select: {
          id: true,
          slug: true,
          businessName: true,
          tagline: true,
          webPresence: true,
          // Custom domain lives on SellerWebsite; sellerVisitUrl needs both.
          website: { select: { customDomain: true, customDomainStatus: true } },
          location: { select: { name: true } },
        },
      },
    },
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <nav className="mb-6 flex flex-wrap gap-4 border-b border-neutral-200 pb-3 text-sm">
        <Link href="/account/requirements" className="hover:underline">
          My requirements
        </Link>
        <Link href="/account/orders" className="hover:underline">
          My orders
        </Link>
        <Link href="/account/saved" className="hover:underline">
          Saved suppliers
        </Link>
      </nav>

      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Saved suppliers</h1>

      {saved.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center">
          <p className="text-sm text-neutral-600">You haven&apos;t saved any suppliers yet.</p>
          <Link href="/sellers" className="mt-3 inline-block text-sm underline">
            Browse suppliers
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {saved.map(({ seller, createdAt }) => (
            <li
              key={seller.id}
              className="flex flex-wrap items-baseline justify-between gap-3 rounded-lg border border-neutral-200 bg-white p-4 text-sm"
            >
              <div>
                <Link
                  href={`/seller/${seller.slug}`}
                  className="font-medium hover:underline"
                >
                  {seller.businessName}
                </Link>
                {seller.tagline ? (
                  <p className="mt-0.5 text-neutral-600">{seller.tagline}</p>
                ) : null}
                <p className="mt-0.5 text-xs text-neutral-500">
                  {seller.location?.name ? `${seller.location.name} · ` : ""}
                  saved{" "}
                  <time dateTime={createdAt.toISOString()}>
                    {createdAt.toLocaleDateString("en-IN")}
                  </time>
                </p>
              </div>

              {seller.webPresence !== "CATALOGUE" ? (
                <a
                  href={sellerVisitUrl({
                    slug: seller.slug,
                    webPresence: seller.webPresence,
                    customDomain: seller.website?.customDomain,
                    customDomainStatus: seller.website?.customDomainStatus,
                  })}
                  className="text-neutral-900 underline underline-offset-2"
                >
                  Visit store ↗
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
