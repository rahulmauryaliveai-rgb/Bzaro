import Link from "next/link";
import { ImageGallery } from "@/components/shared/ImageGallery";
import type { ProductDetailProps } from "@/components/site/templates/registry";
import { ProductCard } from "@/components/site/sections/ProductCard";
import { Breadcrumbs } from "@/components/site/sections/common";
import { ContactIntent } from "@/components/buyer/ContactIntent";
import { PurchaseActions } from "@/components/site/PurchaseActions";
import { formatPrice } from "@/lib/utils/money";
import { z } from "zod";

/**
 * Product detail body, shared by every template.
 *
 * This is the page that converts: a buyer has found a specific product and
 * needs price, specification, and a way to make contact — in that order, above
 * the fold, on a phone. Everything here is arranged around that.
 */

/**
 * Specifications are seller-supplied JSON. Validated before render rather than
 * trusted: the column accepts any shape, and `.map()` over a non-array would
 * throw inside a cached page.
 */
const specificationsSchema = z
  .array(z.object({ key: z.string().max(120), value: z.string().max(500) }))
  .max(100);

export function ProductDetailBody({ context, data }: ProductDetailProps) {
  const { product, related } = data;
  const { seller } = context;

  const specs = specificationsSchema.safeParse(product.specifications);
  const specifications = specs.success ? specs.data : [];

  const price = formatPrice({
    minor: product.priceMinor,
    maxMinor: product.priceMaxMinor,
    currency: product.currency,
    unit: product.unit,
    onRequest: product.priceOnRequest,
  });

  return (
    <>
      <Breadcrumbs
        trail={[
          { href: "/", label: "Home" },
          { href: "/products", label: "Products" },
          { href: `/products/${product.slug}`, label: product.name },
        ]}
      />

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
            <div
              className="flex aspect-4/3 w-full items-center justify-center rounded-lg border text-sm opacity-40"
              style={{ borderColor: "var(--site-border)", background: "var(--site-surface)" }}
            >
              No image provided
            </div>
          )}
        </div>

        <div>
          {product.brand ? (
            <p className="text-xs font-medium tracking-widest uppercase opacity-60">
              {product.brand}
            </p>
          ) : null}

          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance">
            {product.name}
          </h1>

          {product.shortDescription ? (
            <p className="mt-3 text-lg opacity-75">{product.shortDescription}</p>
          ) : null}

          <p className="mt-6 text-2xl font-semibold tabular-nums">{price}</p>

          {product.minOrderQty && product.minOrderQty > 1 ? (
            <p className="mt-1 text-sm opacity-70">
              Minimum order: {product.minOrderQty} {product.unit ?? "units"}
            </p>
          ) : null}

          <div className="mt-7">
            <PurchaseActions
              sellerId={seller.id}
              product={{
                id: product.id,
                priceMinor: product.priceMinor,
                priceOnRequest: product.priceOnRequest,
              }}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <ContactIntent
              className="contents"
              seller={{
                id: seller.id,
                businessName: seller.businessName,
                whatsapp: seller.whatsapp,
              }}
              product={{ id: product.id, name: product.name }}
            />

            {seller.phone ? (
              <a
                href={`tel:${seller.phone}`}
                className="inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium"
                style={{ borderColor: "var(--site-border)" }}
              >
                Call {seller.phone}
              </a>
            ) : null}

            <Link
              href="/contact"
              className="inline-flex items-center rounded-md px-4 py-2 text-sm font-medium"
              style={{ background: "var(--site-primary)", color: "var(--site-background)" }}
            >
              Send enquiry
            </Link>
          </div>

          {(product.sku ?? product.modelNumber) ? (
            <dl className="mt-8 flex gap-8 text-sm">
              {product.sku ? (
                <div>
                  <dt className="opacity-60">SKU</dt>
                  <dd className="font-mono">{product.sku}</dd>
                </div>
              ) : null}
              {product.modelNumber ? (
                <div>
                  <dt className="opacity-60">Model</dt>
                  <dd className="font-mono">{product.modelNumber}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </div>
      </div>

      {product.description ? (
        <section className="mt-14 max-w-3xl">
          <h2 className="text-lg font-semibold">Description</h2>
          {/* Plain text, split on blank lines. Seller descriptions are stored as
              text, never HTML — rendering them as markup would be a stored-XSS
              vector on a domain shared by every seller. */}
          <div className="mt-3 space-y-4 leading-relaxed opacity-85">
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
        <section className="mt-14 max-w-3xl">
          <h2 className="text-lg font-semibold">Specifications</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {specifications.map((spec) => (
                  <tr
                    key={spec.key}
                    className="border-b last:border-0"
                    style={{ borderColor: "var(--site-border)" }}
                  >
                    <th scope="row" className="w-1/3 py-2.5 pr-4 text-left font-normal opacity-65">
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

      {related.length > 0 ? (
        <section className="mt-16">
          <h2 className="mb-5 text-lg font-semibold">More from {seller.businessName}</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
