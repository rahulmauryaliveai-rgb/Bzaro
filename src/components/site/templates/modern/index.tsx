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
import { GalleryGrid } from "@/components/site/sections/GalleryGrid";
import { ContactIntent } from "@/components/buyer/ContactIntent";
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
 * Modern template.
 *
 * Centred composition, large display type, generous whitespace, full-bleed
 * hero. It exists to prove the registry contract: it consumes exactly the same
 * props as Classic and shares every page body, so a seller switching between
 * them loses nothing — only the arrangement changes.
 */

function Home({ context, data }: HomeProps) {
  const { seller } = context;
  const { products, services, gallery } = data;

  const locality = [seller.address.city, seller.address.state].filter(Boolean).join(" · ");

  return (
    <SiteShell context={context}>
      <section className="py-10 text-center">
        {locality ? (
          <p className="text-xs font-medium tracking-[0.2em] uppercase opacity-60">{locality}</p>
        ) : null}

        <h1 className="mt-5 text-5xl font-semibold tracking-tight text-balance sm:text-6xl">
          {seller.businessName}
        </h1>

        {seller.tagline ? (
          <p className="mx-auto mt-5 max-w-xl text-lg opacity-75">{seller.tagline}</p>
        ) : null}

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ContactIntent seller={seller} show="whatsapp" className="flex flex-wrap gap-3" />
          <Link
            href="/contact"
            className="inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium"
            style={{ borderColor: "var(--site-border)" }}
          >
            Contact us
          </Link>
        </div>
      </section>

      {seller.coverImageUrl ? (
        <div
          className="aspect-21/9 w-full overflow-hidden rounded-xl border"
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

      {seller.description ? (
        <p className="mx-auto mt-16 max-w-2xl text-center text-lg leading-relaxed opacity-85">
          {seller.description.length > 320
            ? `${seller.description.slice(0, 320).trimEnd()}…`
            : seller.description}
        </p>
      ) : null}

      {products.length > 0 ? (
        <CenteredSection title="Products" href="/products" label="See the full catalogue">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </CenteredSection>
      ) : null}

      {services.length > 0 ? (
        <CenteredSection title="Services" href="/services" label="All services">
          <div className="grid gap-5 sm:grid-cols-2">
            {services.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </div>
        </CenteredSection>
      ) : null}

      {gallery.length > 0 ? (
        <CenteredSection title="Gallery" href="/gallery" label="View gallery">
          <GalleryGrid
            items={gallery.map((item) => ({
              ...item,
              caption: null,
              width: null,
              height: null,
            }))}
          />
        </CenteredSection>
      ) : null}
    </SiteShell>
  );
}

function CenteredSection({
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
    <section className="mt-20">
      <div className="mb-7 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <Link
          href={href}
          className="mt-1 inline-block text-sm underline underline-offset-4 opacity-70 hover:opacity-100"
        >
          {label}
        </Link>
      </div>
      {children}
    </section>
  );
}

export const ModernTemplate: SiteTemplate = {
  key: "modern",
  name: "Modern",
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
