import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSeller, scopeSurface } from "@/lib/auth/guards";
import { getCategoryOptions, getServiceForEdit } from "@/server/services/catalog.service";
import { ServiceForm } from "@/components/dashboard/ServiceForm";
import { DeleteCatalogItem } from "@/components/dashboard/DeleteCatalogItem";
import { minorToMajorString } from "@/lib/utils/money";
import { sellerSiteUrl } from "@/lib/utils/url";

export const metadata: Metadata = {
  title: "Edit service",
  robots: { index: false, follow: false },
};

export default async function EditServicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const scope = await requireSeller();
  const { id } = await params;
  const { created } = await searchParams;

  const [service, categories] = await Promise.all([
    getServiceForEdit(scope.sellerId, id),
    getCategoryOptions(),
  ]);

  if (!service) notFound();

  const live = service.status === "PUBLISHED" && service.moderationStatus === "APPROVED";

  return (
    <div className="max-w-2xl">
      <header className="mb-6">
        <Link href="/dashboard/services" className="text-sm text-neutral-500 hover:underline">
          ← Services
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{service.name}</h1>

        {live ? (
          <a
            href={sellerSiteUrl(scopeSurface(scope), `/services/${service.slug}`)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-teal-700 underline underline-offset-2"
          >
            {scope.webPresence === "CATALOGUE" ? "View on Bzaro ↗" : "View on your website ↗"}
          </a>
        ) : null}
      </header>

      {created ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-900">
          <span>
            Service saved.{" "}
            {service.status !== "PUBLISHED"
              ? "It stays a draft until you set it to Published below."
              : live
                ? "It is live."
                : "It goes live as soon as your business is verified."}
          </span>
          <Link
            href="/dashboard/services/new"
            className="rounded-md bg-teal-700 px-3 py-1.5 font-medium text-white hover:bg-teal-800"
          >
            + Add another service
          </Link>
        </div>
      ) : null}

      {service.status === "PUBLISHED" && service.moderationStatus === "PENDING" ? (
        <p className="mb-6 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Saved. It appears on your website and the marketplace as soon as your business is verified.
        </p>
      ) : null}

      {service.moderationStatus === "REJECTED" ? (
        <p className="mb-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          This listing was rejected during review and is not public. Check your email for what to
          change, then edit and save it to submit it again.
        </p>
      ) : null}

      <ServiceForm
        categories={categories}
        values={{
          id: service.id,
          name: service.name,
          slug: service.slug,
          categoryId: service.categoryId,
          shortDescription: service.shortDescription,
          description: service.description,
          price: minorToMajorString(service.priceMinor, service.currency),
          currency: service.currency,
          pricingModel: service.pricingModel,
          priceOnRequest: service.priceOnRequest,
          serviceAreas: service.serviceAreas,
          imageUrl: service.imageUrl,
          tags: service.tags,
          metaTitle: service.metaTitle,
          metaDescription: service.metaDescription,
          status: service.status,
        }}
      />

      <div className="mt-8">
        <DeleteCatalogItem kind="service" id={service.id} name={service.name} />
      </div>
    </div>
  );
}
