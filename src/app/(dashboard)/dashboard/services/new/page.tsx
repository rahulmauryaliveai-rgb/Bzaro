import type { Metadata } from "next";
import Link from "next/link";
import { requireSeller } from "@/lib/auth/guards";
import { getCategoryOptions, getModerationSignals } from "@/server/services/catalog.service";
import { decideModeration } from "@/lib/validation/moderation";
import { ServiceForm } from "@/components/dashboard/ServiceForm";

export const metadata: Metadata = {
  title: "Add a service",
  robots: { index: false, follow: false },
};

export default async function NewServicePage() {
  const scope = await requireSeller();

  const [categories, signals] = await Promise.all([
    getCategoryOptions(),
    getModerationSignals(scope.sellerId),
  ]);

  const decision = decideModeration(signals);

  return (
    <div className="max-w-2xl">
      <header className="mb-6">
        <Link href="/dashboard/services" className="text-sm text-neutral-500 hover:underline">
          ← Services
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Add a service</h1>
      </header>

      {decision.status === "PENDING" ? (
        <p className="mb-6 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {decision.reason}
        </p>
      ) : null}

      <ServiceForm
        categories={categories}
        values={{
          name: "",
          slug: "",
          categoryId: null,
          shortDescription: null,
          description: null,
          price: "",
          currency: "INR",
          pricingModel: null,
          priceOnRequest: true,
          serviceAreas: [],
          imageUrl: null,
          tags: [],
          metaTitle: null,
          metaDescription: null,
          status: "DRAFT",
        }}
      />
    </div>
  );
}
