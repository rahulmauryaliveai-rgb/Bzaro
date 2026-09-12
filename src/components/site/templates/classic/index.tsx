import Link from "next/link";
import type {
  AboutProps,
  ContactProps,
  GalleryProps,
  HomeProps,
  ProductDetailProps,
  ProductsProps,
  ServiceDetailProps,
  ServicesProps,
  SiteTemplate,
} from "@/components/site/templates/registry";
import { SiteShell } from "@/components/site/sections/SiteShell";
import { SiteImage } from "@/components/site/sections/SiteImage";
import { ProductCard } from "@/components/site/sections/ProductCard";
import { ServiceCard } from "@/components/site/sections/ServiceCard";
import { ContactPanel } from "@/components/site/sections/ContactPanel";
import { GalleryGrid } from "@/components/site/sections/GalleryGrid";
import { WhatsAppButton } from "@/components/shared/WhatsAppButton";
import {
  AboutBody,
  ContactBody,
  GalleryBody,
  ProductsBody,
  ServiceDetailBody,
  ServicesBody,
} from "@/components/site/pages/bodies";
import { ProductDetailBody } from "@/components/site/pages/ProductDetailBody";

/**
 * Classic template.
 *
 * A conventional business-directory layout: banner hero, left-aligned type,
 * clear hierarchy, no surprises. This is the default because it is what a
 * B2B buyer expects, and familiarity converts better than novelty when the
 * visitor's question is "is this supplier real?".
 */

function Home({ context, data }: HomeProps) {
  const { seller } = context;
  const { products, services, gallery } = data;

  return (
    <SiteShell context={context}>
      {seller.coverImageUrl ? (
        <div
          className="mb-8 aspect-21/9 w-full overflow-hidden rounded-lg border"
          style={{ borderColor: "var(--site-border)" }}
        >
          <SiteImage
            src={seller.coverImageUrl}
            alt=""
            priority
            className="h-full w-full object-cover"
          />
        </div>
      ) : null}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-balance">
            {seller.businessName}
          </h1>
          {seller.tagline ? <p className="mt-2 text-lg opacity-75">{seller.tagline}</p> : null}

          {seller.description ? (
            <p className="mt-6 leading-relaxed opacity-85">
              {seller.description.length > 400
                ? `${seller.description.slice(0, 400).trimEnd()}…`
                : seller.description}
            </p>
          ) : null}

          <div className="mt-7 flex flex-wrap gap-3">
            {seller.whatsapp ? (
              <WhatsAppButton
                phone={seller.whatsapp}
                context={{ kind: "seller", sellerName: seller.businessName }}
              />
            ) : null}
            {seller.phone ? (
              <a
                href={`tel:${seller.phone}`}
                className="inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium"
                style={{ borderColor: "var(--site-border)" }}
              >
                Call {seller.phone}
              </a>
            ) : null}
          </div>
        </div>

        <aside
          className="rounded-lg border p-5"
          style={{ borderColor: "var(--site-border)", background: "var(--site-surface)" }}
        >
          <h2 className="mb-4 text-sm font-semibold tracking-wide uppercase opacity-70">Contact</h2>
          <ContactPanel seller={seller} showHours={false} />
        </aside>
      </div>

      {products.length > 0 ? (
        <SectionBlock title="Products" href="/products" label="View all products">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </SectionBlock>
      ) : null}

      {services.length > 0 ? (
        <SectionBlock title="Services" href="/services" label="View all services">
          <div className="grid gap-5 sm:grid-cols-2">
            {services.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </div>
        </SectionBlock>
      ) : null}

      {gallery.length > 0 ? (
        <SectionBlock title="Gallery" href="/gallery" label="View gallery">
          <GalleryGrid
            items={gallery.map((item) => ({
              ...item,
              caption: null,
              width: null,
              height: null,
            }))}
          />
        </SectionBlock>
      ) : null}
    </SiteShell>
  );
}

function SectionBlock({
  title,
  href,
  label,
  children,
}: {
  title: string;
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-16">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <Link
          href={href}
          className="text-sm underline underline-offset-2 opacity-70 hover:opacity-100"
        >
          {label}
        </Link>
      </div>
      {children}
    </section>
  );
}

export const ClassicTemplate: SiteTemplate = {
  key: "classic",
  name: "Classic",
  Home,
  About: (props: AboutProps) => (
    <SiteShell context={props.context} width="narrow">
      <AboutBody {...props} />
    </SiteShell>
  ),
  Products: (props: ProductsProps) => (
    <SiteShell context={props.context}>
      <ProductsBody {...props} />
    </SiteShell>
  ),
  ProductDetail: (props: ProductDetailProps) => (
    <SiteShell context={props.context}>
      <ProductDetailBody {...props} />
    </SiteShell>
  ),
  Services: (props: ServicesProps) => (
    <SiteShell context={props.context}>
      <ServicesBody {...props} />
    </SiteShell>
  ),
  ServiceDetail: (props: ServiceDetailProps) => (
    <SiteShell context={props.context} width="narrow">
      <ServiceDetailBody {...props} />
    </SiteShell>
  ),
  Gallery: (props: GalleryProps) => (
    <SiteShell context={props.context}>
      <GalleryBody {...props} />
    </SiteShell>
  ),
  Contact: (props: ContactProps) => (
    <SiteShell context={props.context} width="narrow">
      <ContactBody {...props} />
    </SiteShell>
  ),
};
