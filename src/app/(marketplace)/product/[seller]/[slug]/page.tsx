import type { Metadata } from "next";
import { ImageGallery } from "@/components/shared/ImageGallery";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getMarketplaceProduct, getSellerProducts } from "@/server/services/marketplace.service";
import { getRelatedProducts } from "@/server/services/discovery.service";
import { getPostsForCategory, getPostsMentioning } from "@/server/services/blog.service";
import { RelatedArticles } from "@/components/blog/BlogCards";
import { getCategoryAncestors } from "@/server/services/taxonomy.service";
import { ProductResultCard } from "@/components/marketplace/ResultCards";
import { toProductHit } from "@/components/marketplace/hits";
import { MarketplaceBreadcrumbs } from "@/components/marketplace/ResultsPagination";
import { ContactIntent } from "@/components/buyer/ContactIntent";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd, productJsonLd } from "@/lib/seo/jsonld";
import { formatPrice } from "@/lib/utils/money";
import {
  marketplaceUrl,
  sellerCanonicalUrl,
  sellerSurfaceOf,
  sellerVisitUrl,
} from "@/lib/utils/url";
import { productSeoDescription, productSeoTitle, type ProductSeoInput } from "@/lib/seo/templates";

/**
 * Marketplace product page.
 *
 * ── Canonical: the seller's site when it is indexable (D1, D32, D44) ─────────
 * For a seller whose own site has cleared the D2 quality gate, `rel=canonical`
 * points at that site: the seller's subdomain owns product content, the
 * marketplace owns discovery. Otherwise — Free sellers, and website sellers
 * whose site is still blocked by robots.txt — this page IS the canonical copy.
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

  const seo = productSeo(product);
  const indexable = product.seller.website?.indexable ?? false;
  const canonical = sellerCanonicalUrl(
    sellerSurfaceOf(product.seller),
    indexable,
    `/products/${product.slug}`,
  );

  return {
    title: productSeoTitle(seo),
    description: productSeoDescription(seo),
    // D44: the seller's own site once it clears the D2 gate, this page
    // otherwise — never a URL that robots.txt blocks.
    alternates: { canonical },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      type: "website",
      title: product.name,
      description: productSeoDescription(seo),
      url: canonical,
      ...(product.images[0] ? { images: [product.images[0].url] } : {}),
    },
  };
}

type ProductForSeo = NonNullable<Awaited<ReturnType<typeof getMarketplaceProduct>>>;

function productSeo(product: ProductForSeo): ProductSeoInput {
  return {
    name: product.name,
    sellerName: product.seller.businessName,
    city: product.seller.location?.name ?? null,
    metaTitle: product.metaTitle,
    metaDescription: product.metaDescription,
    shortDescription: product.shortDescription,
    description: product.description,
    brand: product.brand,
    priceLabel: formatPrice({
      minor: product.priceMinor,
      maxMinor: product.priceMaxMinor,
      currency: product.currency,
      unit: product.unit,
      onRequest: product.priceOnRequest,
    }),
    minOrderLabel: product.minOrderQty
      ? `${product.minOrderQty}${product.unit ? ` ${product.unit}` : ""}`
      : null,
  };
}

export default async function MarketplaceProductPage({ params }: Props) {
  const { seller: sellerSlug, slug } = await params;
  const product = await getMarketplaceProduct(sellerSlug, slug);

  if (!product) notFound();

  const [related, ancestors, comparable, guides] = await Promise.all([
    getSellerProducts(product.seller.id, product.seller.slug, 5),
    product.category ? getCategoryAncestors(product.category.ancestorIds) : Promise.resolve([]),
    product.category
      ? getRelatedProducts(product.category.id, product.category.parentId, product.seller.id, 4)
      : Promise.resolve([]),
    // Guides that feature this product, else guides on its category (D45).
    getPostsMentioning({ productId: product.id, sellerId: product.seller.id }, 3).then((posts) =>
      posts.length > 0 || !product.category
        ? posts
        : getPostsForCategory(product.category.id, product.category.ancestorIds, 3),
    ),
  ]);
  const specs = specificationsSchema.safeParse(product.specifications);
  const specifications = specs.success ? specs.data : [];

  const hasWebsite = product.seller.webPresence !== "CATALOGUE";
  const surface = sellerSurfaceOf(product.seller);
  // JSON-LD and canonical use the canonical URL; only the clickable link is tagged.
  const canonicalUrl = sellerCanonicalUrl(
    surface,
    product.seller.website?.indexable ?? false,
    `/products/${product.slug}`,
  );
  const micrositeVisitUrl = sellerVisitUrl(surface, `/products/${product.slug}`);
  const locality = [product.seller.location?.name, product.seller.location?.parent?.name]
    .filter(Boolean)
    .join(", ");

  const trail = [
    { href: "/", label: "Home" },
    // The full category trail, so the breadcrumb (and its JSON-LD) links every
    // level of the taxonomy, not just the leaf.
    ...ancestors.map((node) => ({ href: `/category${node.path}`, label: node.name })),
    ...(product.category
      ? [{ href: `/category${product.category.path}`, label: product.category.name }]
      : []),
    { href: `/product/${sellerSlug}/${slug}`, label: product.name },
  ];
  const sellerCity = product.seller.location?.type === "CITY" ? product.seller.location : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <JsonLd
        data={[
          productJsonLd({
            product,
            // The Offer URL points at the canonical location.
            url: canonicalUrl,
            sellerName: product.seller.businessName,
            category: product.category?.name ?? null,
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
                href={micrositeVisitUrl}
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

      {comparable.length > 0 && product.category ? (
        <section className="mt-16">
          <h2 className="mb-5 text-lg font-semibold">
            Compare {product.category.name} from other suppliers
          </h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {comparable.map((item) => (
              <ProductResultCard key={item.id} hit={toProductHit(item)} />
            ))}
          </div>
        </section>
      ) : null}

      <RelatedArticles title="Buying guides" posts={guides} />

      {product.category ? (
        <nav aria-label="Explore" className="mt-14 border-t border-neutral-200 pt-6 text-sm">
          <p className="font-medium text-neutral-900">Explore</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            <li>
              <Link
                href={`/category${product.category.path}`}
                className="inline-block rounded-full border border-neutral-300 px-3.5 py-1.5 hover:bg-neutral-50"
              >
                All {product.category.name} suppliers
              </Link>
            </li>
            {sellerCity ? (
              <li>
                <Link
                  href={`/${sellerCity.slug}/category${product.category.path}`}
                  className="inline-block rounded-full border border-neutral-300 px-3.5 py-1.5 hover:bg-neutral-50"
                >
                  {product.category.name} in {sellerCity.name}
                </Link>
              </li>
            ) : null}
            <li>
              <Link
                href={`/seller/${product.seller.slug}`}
                className="inline-block rounded-full border border-neutral-300 px-3.5 py-1.5 hover:bg-neutral-50"
              >
                {product.seller.businessName} profile
              </Link>
            </li>
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
