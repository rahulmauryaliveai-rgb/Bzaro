import Link from "next/link";
import { z } from "zod";
import type {
  AboutProps,
  ContactProps,
  GalleryProps,
  ProductsProps,
  ServiceDetailProps,
  ServicesProps,
} from "@/components/site/templates/registry";
import { ProductCard } from "@/components/site/sections/ProductCard";
import { ServiceCard } from "@/components/site/sections/ServiceCard";
import { GalleryGrid } from "@/components/site/sections/GalleryGrid";
import { ContactPanel } from "@/components/site/sections/ContactPanel";
import { Breadcrumbs, EmptyState, PageHeader, Pagination } from "@/components/site/sections/common";
import { WhatsAppButton } from "@/components/shared/WhatsAppButton";
import { EnquiryForm } from "@/components/shared/EnquiryForm";
import { formatMoney } from "@/lib/utils/money";

/**
 * Page bodies shared by every template.
 *
 * Templates own composition — shell, hero, measure, density — while the bodies
 * own content and behaviour. Duplicating these per template would mean every
 * bug fix lands N times and templates silently drift apart in what they can
 * display, which is exactly what breaks the "switching template loses nothing"
 * guarantee in the registry contract.
 */

/** Render a plain-text field as paragraphs. Never as HTML — see below. */
function Prose({ text }: { text: string }) {
  return (
    <div className="space-y-4 leading-relaxed opacity-85">
      {text
        .split(/\n{2,}/)
        .filter((paragraph) => paragraph.trim().length > 0)
        .map((paragraph, index) => (
          <p key={index}>{paragraph.trim()}</p>
        ))}
    </div>
  );
}

// ── About ────────────────────────────────────────────────────────────────────

export function AboutBody({ context, data }: AboutProps) {
  const { seller } = context;
  const { counts } = data;

  return (
    <>
      <Breadcrumbs
        trail={[
          { href: "/", label: "Home" },
          { href: "/about", label: "About" },
        ]}
      />

      <PageHeader eyebrow="About" title={seller.businessName} description={seller.tagline} />

      {seller.description ? <Prose text={seller.description} /> : null}

      <dl className="mt-10 grid gap-4 sm:grid-cols-3">
        {seller.establishedYear ? (
          <Fact label="Established" value={String(seller.establishedYear)} />
        ) : null}
        {seller.employeeCount ? <Fact label="Team size" value={seller.employeeCount} /> : null}
        {counts.products > 0 ? <Fact label="Products" value={String(counts.products)} /> : null}
        {counts.services > 0 ? <Fact label="Services" value={String(counts.services)} /> : null}
        {seller.address.city ? <Fact label="Based in" value={seller.address.city} /> : null}
        {seller.gstin ? <Fact label="GSTIN" value={seller.gstin} mono /> : null}
      </dl>

      <section className="mt-14">
        <h2 className="mb-5 text-lg font-semibold">Get in touch</h2>
        <ContactPanel seller={seller} />
      </section>
    </>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border p-4" style={{ borderColor: "var(--site-border)" }}>
      <dt className="text-xs font-medium tracking-wide uppercase opacity-60">{label}</dt>
      <dd className={`mt-1 text-lg font-semibold ${mono ? "font-mono text-sm" : ""}`}>{value}</dd>
    </div>
  );
}

// ── Products ─────────────────────────────────────────────────────────────────

export function ProductsBody({ context, data }: ProductsProps) {
  const { items, total, page, pageCount, filters, categories } = data;
  const activeCategory = filters.category
    ? categories.find((category) => category.slug === filters.category)
    : null;
  const filtered = Boolean(filters.q || filters.category);

  return (
    <>
      <Breadcrumbs
        trail={[
          { href: "/", label: "Home" },
          { href: "/products", label: "Products" },
        ]}
      />

      <PageHeader
        eyebrow="Catalogue"
        title={
          activeCategory
            ? activeCategory.name
            : filters.q
              ? `Results for “${filters.q}”`
              : "Products"
        }
        description={
          total > 0
            ? `${total} product${total === 1 ? "" : "s"} from ${context.seller.businessName}.`
            : null
        }
      />

      {categories.length > 1 ? (
        <ul className="-mt-3 mb-8 flex flex-wrap gap-2 text-sm">
          <li>
            <Link
              href="/products"
              className={`inline-block rounded-full border px-3 py-1 ${
                !filters.category ? "font-semibold" : "opacity-70 hover:opacity-100"
              }`}
              style={{ borderColor: "var(--site-border)" }}
            >
              All
            </Link>
          </li>
          {categories.map((category) => (
            <li key={category.slug}>
              <Link
                href={`/products?category=${encodeURIComponent(category.slug)}`}
                className={`inline-block rounded-full border px-3 py-1 ${
                  filters.category === category.slug
                    ? "font-semibold"
                    : "opacity-70 hover:opacity-100"
                }`}
                style={{ borderColor: "var(--site-border)" }}
              >
                {category.name} <span className="opacity-60">{category.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          title={filtered ? "Nothing matches" : "No products listed yet"}
          hint={
            filtered
              ? "Try a different word or browse the full catalogue."
              : "Get in touch to ask what's available."
          }
          action={
            filtered
              ? { href: "/products", label: "All products" }
              : { href: "/contact", label: "Contact us" }
          }
        />
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
          {!filtered ? <Pagination page={page} pageCount={pageCount} basePath="/products" /> : null}
        </>
      )}
    </>
  );
}

// ── Services ─────────────────────────────────────────────────────────────────

export function ServicesBody({ context, data }: ServicesProps) {
  const { items, total } = data;

  return (
    <>
      <Breadcrumbs
        trail={[
          { href: "/", label: "Home" },
          { href: "/services", label: "Services" },
        ]}
      />

      <PageHeader
        eyebrow="What we do"
        title="Services"
        description={
          total > 0
            ? `${total} service${total === 1 ? "" : "s"} from ${context.seller.businessName}.`
            : null
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title="No services listed yet"
          hint="Get in touch to discuss what you need."
          action={{ href: "/contact", label: "Contact us" }}
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((service) => (
            <ServiceCard key={service.id} service={service} />
          ))}
        </div>
      )}
    </>
  );
}

const deliverablesSchema = z.array(z.string().max(300)).max(50);

export function ServiceDetailBody({ context, data }: ServiceDetailProps) {
  const { service } = data;
  const { seller } = context;

  const parsed = deliverablesSchema.safeParse(service.deliverables);
  const deliverables = parsed.success ? parsed.data : [];

  return (
    <>
      <Breadcrumbs
        trail={[
          { href: "/", label: "Home" },
          { href: "/services", label: "Services" },
          { href: `/services/${service.slug}`, label: service.name },
        ]}
      />

      <PageHeader
        eyebrow={service.category?.name ?? "Service"}
        title={service.name}
        description={service.shortDescription}
      />

      {service.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={service.imageUrl}
          alt={service.name}
          className="mb-8 aspect-[16/9] w-full rounded-lg object-cover"
          style={{ borderColor: "var(--site-border)" }}
        />
      ) : null}

      {!service.priceOnRequest && service.priceMinor !== null ? (
        <p className="-mt-4 mb-8 text-2xl font-semibold tabular-nums">
          {formatMoney(service.priceMinor, service.currency)}
          {service.pricingModel ? (
            <span className="ml-2 text-sm font-normal opacity-60">{service.pricingModel}</span>
          ) : null}
        </p>
      ) : (
        <p className="-mt-4 mb-8 text-lg font-medium opacity-70">Price on request</p>
      )}

      {service.description ? <Prose text={service.description} /> : null}

      {deliverables.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">What&rsquo;s included</h2>
          <ul className="mt-3 space-y-2">
            {deliverables.map((item) => (
              <li key={item} className="flex gap-3 opacity-85">
                <span aria-hidden="true" style={{ color: "var(--site-primary)" }}>
                  ✓
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {service.serviceAreas.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Areas served</h2>
          <p className="mt-2 opacity-75">{service.serviceAreas.join(", ")}</p>
        </section>
      ) : null}

      <div className="mt-10 flex flex-wrap gap-3">
        {seller.whatsapp ? (
          <WhatsAppButton
            phone={seller.whatsapp}
            context={{
              kind: "service",
              serviceName: service.name,
              sellerName: seller.businessName,
              url: `${context.urls.base}/services/${service.slug}`,
            }}
          />
        ) : null}
        <Link
          href="/contact"
          className="inline-flex items-center rounded-md px-4 py-2 text-sm font-medium"
          style={{ background: "var(--site-primary)", color: "var(--site-background)" }}
        >
          Request a quote
        </Link>
      </div>
    </>
  );
}

// ── Gallery ──────────────────────────────────────────────────────────────────

export function GalleryBody({ context, data }: GalleryProps) {
  const { items } = data;

  return (
    <>
      <Breadcrumbs
        trail={[
          { href: "/", label: "Home" },
          { href: "/gallery", label: "Gallery" },
        ]}
      />

      <PageHeader
        eyebrow="Gallery"
        title={`Inside ${context.seller.businessName}`}
        description={items.length > 0 ? null : undefined}
      />

      {items.length === 0 ? (
        <EmptyState
          title="No photos yet"
          hint="This business hasn't added gallery images."
          action={{ href: "/products", label: "Browse products" }}
        />
      ) : (
        <GalleryGrid items={items} />
      )}
    </>
  );
}

// ── Contact ──────────────────────────────────────────────────────────────────

export function ContactBody({ context }: ContactProps) {
  const { seller } = context;

  return (
    <>
      <Breadcrumbs
        trail={[
          { href: "/", label: "Home" },
          { href: "/contact", label: "Contact" },
        ]}
      />

      <PageHeader
        eyebrow="Contact"
        title={`Get in touch with ${seller.businessName}`}
        description={seller.tagline}
      />

      <ContactPanel seller={seller} />

      <section className="mt-14">
        <h2 className="mb-1 text-lg font-semibold">Send an enquiry</h2>
        <p className="mb-5 text-sm opacity-70">
          Tell {seller.businessName} what you need and they&rsquo;ll reply directly.
        </p>
        <EnquiryForm sellerSlug={seller.slug} source="MICROSITE_CONTACT" themed />
      </section>
    </>
  );
}
