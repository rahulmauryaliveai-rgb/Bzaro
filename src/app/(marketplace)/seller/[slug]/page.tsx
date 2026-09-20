import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMarketplaceSeller, getSellerProducts } from "@/server/services/marketplace.service";
import { MarketplaceBreadcrumbs } from "@/components/marketplace/ResultsPagination";
import { ContactIntent } from "@/components/buyer/ContactIntent";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";
import { formatPrice } from "@/lib/utils/money";
import { marketplaceUrl, sellerSiteUrl } from "@/lib/utils/url";

/**
 * Seller profile on the marketplace.
 *
 * Canonical points at the seller's microsite home (decision D1) — the seller
 * owns their own identity page.
 *
 * This page earns its place by giving the buyer what the microsite structurally
 * cannot: the supplier placed within the marketplace's taxonomy and geography,
 * with routes onward to comparable suppliers.
 */

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const seller = await getMarketplaceSeller(slug);

  if (!seller) return { title: "Supplier not found", robots: { index: false, follow: false } };

  const locality = [seller.location?.name, seller.location?.parent?.name]
    .filter(Boolean)
    .join(", ");

  return {
    title: `${seller.businessName}${locality ? ` — ${locality}` : ""}`,
    description:
      seller.description?.slice(0, 160) ??
      `${seller.businessName}: products, services and contact details.`,
    // Decision D32: canonical is the seller's highest surface — this page for
    // a catalogue-tier seller, their subdomain or domain otherwise.
    alternates: { canonical: sellerSiteUrl(seller) },
    openGraph: {
      type: "website",
      title: seller.businessName,
      url: marketplaceUrl(`/seller/${slug}`),
      ...(seller.coverImageUrl ? { images: [seller.coverImageUrl] } : {}),
    },
  };
}

export default async function MarketplaceSellerPage({ params }: Props) {
  const { slug } = await params;
  const seller = await getMarketplaceSeller(slug);

  if (!seller) notFound();

  const products = await getSellerProducts(seller.id, seller.slug, 8);

  const locality = [seller.location?.name, seller.location?.parent?.name]
    .filter(Boolean)
    .join(", ");

  const primaryCategory =
    seller.categories.find((entry) => entry.isPrimary)?.category ?? seller.categories[0]?.category;

  const trail = [
    { href: "/", label: "Home" },
    ...(primaryCategory
      ? [{ href: `/category${primaryCategory.path}`, label: primaryCategory.name }]
      : []),
    { href: `/seller/${slug}`, label: seller.businessName },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <JsonLd data={breadcrumbJsonLd(trail, marketplaceUrl())} />

      <MarketplaceBreadcrumbs trail={trail} />

      <header className="flex flex-wrap items-start gap-5">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100">
          {seller.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={seller.logoUrl}
              alt=""
              className="h-full w-full object-contain"
              decoding="async"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-2xl font-semibold text-neutral-400">
              {seller.businessName.charAt(0)}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight text-balance">
              {seller.businessName}
            </h1>
            {seller.verifiedAt ? (
              <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-800">
                ✓ Verified
              </span>
            ) : null}
          </div>

          {seller.tagline ? <p className="mt-1 text-neutral-600">{seller.tagline}</p> : null}

          <p className="mt-2 text-sm text-neutral-500">
            {[locality, seller.establishedYear ? `Since ${seller.establishedYear}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </header>

      <div className="mt-6 flex flex-wrap gap-3">
        <ContactIntent
          className="contents"
          seller={{
            id: seller.id,
            businessName: seller.businessName,
            whatsapp: seller.whatsapp,
            primaryCategoryId:
              seller.categories.find((c) => c.isPrimary)?.categoryId ??
              seller.categories[0]?.categoryId,
          }}
        />
        {seller.phone ? (
          <a
            href={`tel:${seller.phone}`}
            className="inline-flex items-center rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
          >
            Call {seller.phone}
          </a>
        ) : null}
        {seller.webPresence !== "CATALOGUE" ? (
          <a
            href={sellerSiteUrl(seller)}
            className="inline-flex items-center rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Visit website ↗
          </a>
        ) : null}
      </div>

      {seller.description ? (
        <section className="mt-10 max-w-3xl">
          <h2 className="text-lg font-semibold">About</h2>
          <div className="mt-3 space-y-4 leading-relaxed text-neutral-700">
            {seller.description
              .split(/\n{2,}/)
              .filter((paragraph) => paragraph.trim().length > 0)
              .map((paragraph, index) => (
                <p key={index}>{paragraph.trim()}</p>
              ))}
          </div>
        </section>
      ) : null}

      {seller.categories.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-neutral-500 uppercase">
            Categories
          </h2>
          <ul className="flex flex-wrap gap-2">
            {seller.categories.map((entry) => (
              <li key={entry.category.path}>
                <Link
                  href={`/category${entry.category.path}`}
                  className="inline-block rounded-full border border-neutral-300 px-3.5 py-1.5 text-sm hover:bg-neutral-50"
                >
                  {entry.category.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {products.length > 0 ? (
        <section className="mt-12">
          <div className="mb-5 flex items-baseline justify-between gap-4">
            <h2 className="text-lg font-semibold">Products</h2>
            {seller.webPresence !== "CATALOGUE" ? (
              <a
                href={sellerSiteUrl(seller, "/products")}
                className="text-sm text-neutral-600 underline underline-offset-2 hover:text-neutral-900"
              >
                View full catalogue ↗
              </a>
            ) : null}
          </div>

          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {products.map((product) => (
              <li key={product.id}>
                <Link
                  href={`/product/${seller.slug}/${product.slug}`}
                  className="block overflow-hidden rounded-lg border border-neutral-200 hover:shadow-md"
                >
                  <div className="aspect-4/3 bg-neutral-100">
                    {product.images[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.images[0].url}
                        alt={product.images[0].alt ?? product.name}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-medium">{product.name}</p>
                    <p className="mt-1 text-sm text-neutral-600 tabular-nums">
                      {formatPrice({
                        minor: product.priceMinor,
                        maxMinor: product.priceMaxMinor,
                        currency: product.currency,
                        unit: product.unit,
                        onRequest: product.priceOnRequest,
                      })}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {locality && seller.location ? (
        <section className="mt-12 border-t border-neutral-200 pt-6">
          <p className="text-sm text-neutral-600">
            Looking for more suppliers in this area?{" "}
            <Link
              href={`/location${seller.location.path}`}
              className="underline underline-offset-2 hover:text-neutral-900"
            >
              Browse suppliers in {seller.location.name}
            </Link>
          </p>
        </section>
      ) : null}
    </div>
  );
}
