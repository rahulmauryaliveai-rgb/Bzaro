import { RichText } from "@/components/shared/RichText";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMarketplaceSeller, getSellerProducts } from "@/server/services/marketplace.service";
import { MarketplaceBreadcrumbs } from "@/components/marketplace/ResultsPagination";
import { ContactIntent } from "@/components/buyer/ContactIntent";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd, marketplaceSellerJsonLd } from "@/lib/seo/jsonld";
import { getCategorySuppliers } from "@/server/services/discovery.service";
import { getPostsMentioning } from "@/server/services/blog.service";
import { RelatedArticles } from "@/components/blog/BlogCards";
import { SellerResultCard } from "@/components/marketplace/ResultCards";
import { toSellerHit } from "@/components/marketplace/hits";
import { formatPrice } from "@/lib/utils/money";
import {
  marketplaceUrl,
  sellerCanonicalUrl,
  sellerSurfaceOf,
  sellerVisitUrl,
} from "@/lib/utils/url";
import {
  BUSINESS_TYPE_LABEL,
  sellerSeoDescription,
  sellerSeoTitle,
  type BusinessTypeKey,
} from "@/lib/seo/templates";
import { SaveSellerButton } from "@/components/buyer/SaveSellerButton";
import { TrustSeal } from "@/components/marketplace/TrustSeal";

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

  const primaryCategory =
    seller.categories.find((entry) => entry.isPrimary)?.category ?? seller.categories[0]?.category;
  const seo = {
    businessName: seller.businessName,
    businessType: seller.businessType,
    categoryName: primaryCategory?.name ?? null,
    city: seller.location?.name ?? null,
    description: seller.description,
    productCount: seller.productCount,
  };
  const indexable = seller.website?.indexable ?? false;
  const canonical = sellerCanonicalUrl(sellerSurfaceOf(seller), indexable);

  return {
    title: sellerSeoTitle(seo),
    description: sellerSeoDescription(seo),
    // D44: the one indexable copy — the seller's own site once it clears the
    // D2 gate, this page otherwise.
    alternates: { canonical },
    // Thin profiles (no description, no products, unverified contact) stay out
    // of the index until they clear the same gate; links are still followed.
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      type: "website",
      title: seller.businessName,
      description: sellerSeoDescription(seo),
      url: canonical,
      ...(seller.coverImageUrl
        ? { images: [seller.coverImageUrl] }
        : seller.logoUrl
          ? { images: [seller.logoUrl] }
          : {}),
    },
  };
}

export default async function MarketplaceSellerPage({ params }: Props) {
  const { slug } = await params;
  const seller = await getMarketplaceSeller(slug);

  if (!seller) notFound();

  const locality = [seller.location?.name, seller.location?.parent?.name]
    .filter(Boolean)
    .join(", ");

  const primaryCategoryId =
    seller.categories.find((entry) => entry.isPrimary)?.categoryId ??
    seller.categories[0]?.categoryId;
  const [products, similar, guides] = await Promise.all([
    getSellerProducts(seller.id, seller.slug, 8),
    primaryCategoryId
      ? getCategorySuppliers(primaryCategoryId, 5)
      : Promise.resolve({ sellers: [], total: 0 }),
    getPostsMentioning({ sellerId: seller.id }, 3),
  ]);
  const similarSellers = similar.sellers.filter((row) => row.id !== seller.id).slice(0, 4);

  // D44: the business schema belongs on the canonical copy only. When the
  // seller's own site is canonical, it carries its own LocalBusiness block.
  const siteIndexable = seller.website?.indexable ?? false;
  const canonicalUrl = sellerCanonicalUrl(sellerSurfaceOf(seller), siteIndexable);
  const marketplaceIsCanonical = canonicalUrl === marketplaceUrl(`/seller/${seller.slug}`);
  const address = [seller.addressLine1, seller.addressLine2, locality, seller.postalCode]
    .filter(Boolean)
    .join(", ");
  const typeLabel =
    seller.businessType && seller.businessType in BUSINESS_TYPE_LABEL
      ? BUSINESS_TYPE_LABEL[seller.businessType as BusinessTypeKey]
      : null;

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
      <JsonLd
        data={[
          breadcrumbJsonLd(trail, marketplaceUrl()),
          ...(marketplaceIsCanonical
            ? [
                marketplaceSellerJsonLd({
                  url: canonicalUrl,
                  businessName: seller.businessName,
                  legalName: seller.legalName,
                  description: seller.description,
                  phone: seller.phone,
                  logoUrl: seller.logoUrl,
                  imageUrl: seller.coverImageUrl ?? seller.logoUrl,
                  establishedYear: seller.establishedYear,
                  street: [seller.addressLine1, seller.addressLine2].filter(Boolean).join(", "),
                  city: seller.location?.name ?? null,
                  state: seller.location?.parent?.name ?? null,
                  postalCode: seller.postalCode,
                  ratingAvg: seller.ratingAvg,
                  ratingCount: seller.ratingCount,
                }),
              ]
            : []),
        ]}
      />

      <MarketplaceBreadcrumbs trail={trail} />

      <header
        className={`flex flex-wrap items-start gap-5 ${
          seller.trustSeal
            ? "rounded-2xl border border-amber-300 bg-linear-to-br from-amber-50 via-yellow-50/50 to-white p-5 ring-1 ring-amber-200"
            : ""
        }`}
      >
        <div
          className={`h-20 w-20 shrink-0 overflow-hidden rounded-lg border bg-neutral-100 ${
            seller.trustSeal ? "border-amber-400 ring-2 ring-amber-300" : "border-neutral-200"
          }`}
        >
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
            {seller.trustSeal ? <TrustSeal /> : null}
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
            href={sellerVisitUrl(sellerSurfaceOf(seller))}
            className="inline-flex items-center rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Visit website ↗
          </a>
        ) : null}
        <SaveSellerButton sellerId={seller.id} />
      </div>

      {seller.description ? (
        <section className="mt-10 max-w-3xl">
          <h2 className="text-lg font-semibold">About</h2>
          <RichText
            text={seller.description}
            className="mt-3 space-y-4 leading-relaxed text-neutral-700"
          />
        </section>
      ) : null}

      <section className="mt-10 max-w-3xl" aria-labelledby="business-details">
        <h2 id="business-details" className="text-lg font-semibold">
          Business details
        </h2>
        <dl className="mt-3 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          {typeLabel ? <Detail label="Business type" value={typeLabel} /> : null}
          {seller.establishedYear ? (
            <Detail label="Established" value={String(seller.establishedYear)} />
          ) : null}
          {seller.employeeCount ? <Detail label="Employees" value={seller.employeeCount} /> : null}
          {seller.gstin ? (
            <Detail
              label="GST"
              value={seller.gstinVerifiedAt ? "Registered · verified by Bzaro" : "Registered"}
            />
          ) : null}
          {seller.certifications.length > 0 ? (
            <Detail label="Certifications" value={seller.certifications.join(", ")} />
          ) : null}
          {address ? <Detail label="Address" value={address} /> : null}
        </dl>
      </section>

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
                href={sellerVisitUrl(sellerSurfaceOf(seller), "/products")}
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

      <RelatedArticles title={`${seller.businessName} in our guides`} posts={guides} />

      {similarSellers.length > 0 ? (
        <section className="mt-14" aria-labelledby="similar-suppliers">
          <h2 id="similar-suppliers" className="mb-4 text-lg font-semibold">
            Similar suppliers
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {similarSellers.map((row) => (
              <SellerResultCard key={row.id} hit={toSellerHit(row)} />
            ))}
          </div>
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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-neutral-900">{value}</dd>
    </div>
  );
}
