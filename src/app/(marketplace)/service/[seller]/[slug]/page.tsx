import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getMarketplaceService } from "@/server/services/marketplace.service";
import { MarketplaceBreadcrumbs } from "@/components/marketplace/ResultsPagination";
import { WhatsAppButton } from "@/components/shared/WhatsAppButton";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd, serviceJsonLd } from "@/lib/seo/jsonld";
import { formatMoney } from "@/lib/utils/money";
import { marketplaceUrl, sellerSiteUrl, sellerVisitUrl } from "@/lib/utils/url";

/** Canonical points at the microsite, same rationale as the product page (D1). */

type Props = { params: Promise<{ seller: string; slug: string }> };

const deliverablesSchema = z.array(z.string().max(300)).max(50);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { seller, slug } = await params;
  const service = await getMarketplaceService(seller, slug);

  if (!service) return { title: "Service not found", robots: { index: false, follow: false } };

  return {
    title: service.metaTitle ?? `${service.name} — ${service.seller.businessName}`,
    description:
      service.metaDescription ??
      service.shortDescription ??
      service.description?.slice(0, 160) ??
      `${service.name} from ${service.seller.businessName}.`,
    alternates: { canonical: sellerSiteUrl(service.seller, `/services/${service.slug}`) },
  };
}

export default async function MarketplaceServicePage({ params }: Props) {
  const { seller: sellerSlug, slug } = await params;
  const service = await getMarketplaceService(sellerSlug, slug);

  if (!service) notFound();

  const parsed = deliverablesSchema.safeParse(service.deliverables);
  const deliverables = parsed.success ? parsed.data : [];

  const hasWebsite = service.seller.webPresence !== "CATALOGUE";
  const micrositeUrl = sellerSiteUrl(service.seller, `/services/${service.slug}`);
  // JSON-LD and canonical use micrositeUrl; only the clickable link is tagged.
  const micrositeVisitUrl = sellerVisitUrl(service.seller, `/services/${service.slug}`);
  const locality = [service.seller.location?.name, service.seller.location?.parent?.name]
    .filter(Boolean)
    .join(", ");

  const trail = [
    { href: "/", label: "Home" },
    ...(service.category
      ? [{ href: `/category${service.category.path}`, label: service.category.name }]
      : []),
    { href: `/service/${sellerSlug}/${slug}`, label: service.name },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <JsonLd
        data={[
          serviceJsonLd({
            service,
            url: micrositeUrl,
            sellerName: service.seller.businessName,
            baseUrl: sellerSiteUrl(service.seller),
          }),
          breadcrumbJsonLd(trail, marketplaceUrl()),
        ]}
      />

      <MarketplaceBreadcrumbs trail={trail} />

      <header>
        {service.category ? (
          <p className="text-xs font-medium tracking-widest text-neutral-500 uppercase">
            {service.category.name}
          </p>
        ) : null}
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance">{service.name}</h1>
        {service.shortDescription ? (
          <p className="mt-3 text-lg text-neutral-600">{service.shortDescription}</p>
        ) : null}
      </header>

      <p className="mt-6 text-2xl font-semibold tabular-nums">
        {service.priceOnRequest || service.priceMinor === null
          ? "Price on request"
          : formatMoney(service.priceMinor, service.currency)}
        {!service.priceOnRequest && service.pricingModel ? (
          <span className="ml-2 text-sm font-normal text-neutral-500">{service.pricingModel}</span>
        ) : null}
      </p>

      <div className="mt-7 flex flex-wrap gap-3">
        {service.seller.whatsapp ? (
          <WhatsAppButton
            phone={service.seller.whatsapp}
            context={{
              kind: "service",
              serviceName: service.name,
              sellerName: service.seller.businessName,
              url: micrositeUrl,
            }}
          />
        ) : null}
        {service.seller.phone ? (
          <a
            href={`tel:${service.seller.phone}`}
            className="inline-flex items-center rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
          >
            Call supplier
          </a>
        ) : null}
      </div>

      {service.description ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">About this service</h2>
          <div className="mt-3 space-y-4 leading-relaxed text-neutral-700">
            {service.description
              .split(/\n{2,}/)
              .filter((paragraph) => paragraph.trim().length > 0)
              .map((paragraph, index) => (
                <p key={index}>{paragraph.trim()}</p>
              ))}
          </div>
        </section>
      ) : null}

      {deliverables.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">What&rsquo;s included</h2>
          <ul className="mt-3 space-y-2 text-neutral-700">
            {deliverables.map((item) => (
              <li key={item} className="flex gap-3">
                <span aria-hidden="true" className="text-teal-700">
                  ✓
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {service.serviceAreas.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Areas served</h2>
          <p className="mt-2 text-neutral-700">{service.serviceAreas.join(", ")}</p>
        </section>
      ) : null}

      <div className="mt-10 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
        <p className="text-xs tracking-wide text-neutral-500 uppercase">Provided by</p>
        <Link
          href={`/seller/${service.seller.slug}`}
          className="mt-1 block font-medium hover:underline"
        >
          {service.seller.businessName}
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
  );
}
