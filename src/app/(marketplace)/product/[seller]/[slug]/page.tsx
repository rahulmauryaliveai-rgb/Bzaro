import type { Metadata } from "next";
import { ImageGallery } from "@/components/shared/ImageGallery";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getMarketplaceProduct, getSellerProducts } from "@/server/services/marketplace.service";
import { MarketplaceBreadcrumbs } from "@/components/marketplace/ResultsPagination";
import { ContactIntent } from "@/components/buyer/ContactIntent";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd, productJsonLd } from "@/lib/seo/jsonld";
import { formatPrice } from "@/lib/utils/money";
import { marketplaceUrl, sellerSiteUrl } from "@/lib/utils/url";

/**
 * Marketplace product page.
 *
 * ── This page is deliberately NOT canonical (decision D1) ────────────────────
 * `rel="canonical"` points at the seller's own microsite. The seller's
 * subdomain owns product content; the marketplace owns discovery. That is the
 * whole bargain: sellers get real, defensible SEO value from their microsite,
 * which is what makes a microsite worth having rather than decorative.
 *
 * So why does this page exist at all? Because a buyer arriving from search or a
 * category listing needs cross-seller context — breadcrumbs back into the
 * taxonomy, the supplier's other products, a route to comparable listings —
 * none of which a single-tenant microsite can provide. It is a good page for
 * humans that deliberately declines to compete for the ranking.
 */

type Props = { params: Promise<{ seller: string; slug: string }> };

const specificationsSchema = z
  .array(z.object({ key: z.string().max(120), value: z.string().max(500) }))
  .max(100);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { seller, slug } = await params;
  const product = await getMarketplaceProduct(seller, slug);

  if (!product) return { title: "Product not found", robots: { index: false, follow: false } };

  return {
    title: product.metaTitle ?? `${product.name} — ${product.seller.businessName}`,
    description:
      product.metaDescription ??
      product.shortDescription ??
      product.description?.slice(0, 160) ??
      `${product.name} from ${product.seller.businessName}.`,
    // Decision D32: the seller's highest surface is canonical. For a seller
    // with a website this page is indexable-but-deferential and consolidates
    // onto the subdomain; for a catalogue-tier seller it IS the canonical.
    alternates: { canonical: sellerSiteUrl(product.seller, `/products/${product.slug}`) },
    openGraph: {
      type: "website",
      title: product.name,
      url: marketplaceUrl(`/product/${seller}/${slug}`),
      ...(product.images[0] ? { images: [product.images[0].url] } : {}),
    },
  };
}

export default async function MarketplaceProductPage({ params }: Props) {
  const { seller: sellerSlug, slug } = await params;
  const product = await getMarketplaceProduct(sellerSlug, slug);

  if (!product) notFound();

  const related = await getSellerProducts(product.seller.id, product.seller.slug, 5);
  const specs = specificationsSchema.safeParse(product.specifications);
  const specifications = specs.success ? specs.data : [];

  const hasWebsite = product.seller.webPresence !== "CATALOGUE";
  const micrositeUrl = sellerSiteUrl(product.seller, `/products/${product.slug}`);
  const locality = [product.seller.location?.name, product.seller.location?.parent?.name]
    .filter(Boolean)
    .join(", ");

  const trail = [
    { href: "/", label: "Home" },
    ...(product.category
      ? [{ href: `/category${product.category.path}`, label: product.category.name }]
      : []),
    { href: `/product/${sellerSlug}/${slug}`, label: product.name },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <JsonLd
        data={[
          productJsonLd({
            product,
            // The Offer URL points at the canonical location, not this page.
            url: micrositeUrl,
            sellerName: product.seller.businessName,
          }),
          breadcrumbJsonLd(trail, marketplaceUrl()),
        ]}
      />

      <MarketplaceBreadcrumbs trail={trail} />

      <div className="grid gap-10 lg:grid-cols-2">
        <div>
          {product.images.length > 0 ? (
            <ImageGallery
              images={product.images.map((image) => ({
                id: image.id,
                url: image.url,
                alt: image.alt,
              }))}
              name={product.name}
            />
          ) : (
            <div className="flex aspect-4/3 w-full items-center justify-center rounded-lg border border-neutral-200 bg-neutral-100 text-sm text-neutral-400">
              No image provided
            </div>
          )}
        </div>

        <div>
          {product.brand ? (
            <p className="text-xs font-medium tracking-widest text-neutral-500 uppercase">
              {product.brand}
            </p>
          ) : null}

          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance">
            {product.name}
          </h1>

          {product.shortDescription ? (
            <p className="mt-3 text-lg text-neutral-600">{product.shortDescription}</p>
          ) : null}

          <p className="mt-6 text-2xl font-semibold tabular-nums">
            {formatPrice({
              minor: product.priceMinor,
              maxMinor: product.priceMaxMinor,
              currency: product.currency,
              unit: product.unit,
              onRequest: product.priceOnRequest,
            })}
          </p>

          {product.minOrderQty && product.minOrderQty > 1 ? (
            <p className="mt-1 text-sm text-neutral-600">
              Minimum order: {product.minOrderQty} {product.unit ?? "units"}
            </p>
          ) : null}

          <div className="mt-7 flex flex-wrap gap-3">
            <ContactIntent
              className="contents"
              seller={product.seller}
              product={{ id: product.id, name: product.name }}
            />
            {product.seller.phone ? (
              <a
                href={`tel:${product.seller.phone}`}
                className="inline-flex items-center rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
              >
                Call supplier
              </a>
            ) : null}
          </div>

          <div className="mt-8 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
            <p className="text-xs tracking-wide text-neutral-500 uppercase">Supplied by</p>
            <Link
              href={`/seller/${product.seller.slug}`}
              className="mt-1 block font-medium hover:underline"
            >
              {product.seller.businessName}
            </Link>
            {locality ? <p className="text-sm text-neutral-600">{locality}</p> : null}
            {hasWebsite ? (
              <a
                href={micrositeUrl}
                className="text-brand-700 mt-2 inline-block text-sm underline underline-offset-2"
              >
                Visit their website ↗
              </a>
            ) : null}
          </div>
        </div>
      </div>

      {product.description ? (
        <section className="mt-14 max-w-3xl">
          <h2 className="text-lg font-semibold">Description</h2>
          <div className="mt-3 space-y-4 leading-relaxed text-neutral-700">
            {product.description
              .split(/\n{2,}/)
              .filter((paragraph) => paragraph.trim().length > 0)
              .map((paragraph, index) => (
                <p key={index}>{paragraph.trim()}</p>
              ))}
          </div>
        </section>
      ) : null}

      {specifications.length > 0 ? (
        <section className="mt-12 max-w-3xl">
          <h2 className="text-lg font-semibold">Specifications</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {specifications.map((spec) => (
                  <tr key={spec.key} className="border-b border-neutral-200 last:border-0">
                    <th
                      scope="row"
                      className="w-1/3 py-2.5 pr-4 text-left font-normal text-neutral-500"
                    >
                      {spec.key}
                    </th>
                    <td className="py-2.5">{spec.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {related.filter((item) => item.id !== product.id).length > 0 ? (
        <section className="mt-16">
          <h2 className="mb-5 text-lg font-semibold">More from {product.seller.businessName}</h2>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {related
              .filter((item) => item.id !== product.id)
              .slice(0, 4)
              .map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/product/${product.seller.slug}/${item.slug}`}
                    className="block overflow-hidden rounded-lg border border-neutral-200 hover:shadow-md"
                  >
                    <div className="aspect-4/3 bg-neutral-100">
                      {item.images[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.images[0].url}
                          alt={item.images[0].alt ?? item.name}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="p-3">
                      <p className="text-sm font-medium">{item.name}</p>
                      <p className="mt-1 text-sm text-neutral-600 tabular-nums">
                        {formatPrice({
                          minor: item.priceMinor,
                          maxMinor: item.priceMaxMinor,
                          currency: item.currency,
                          unit: item.unit,
                          onRequest: item.priceOnRequest,
                        })}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
