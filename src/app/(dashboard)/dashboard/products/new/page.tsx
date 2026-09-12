import type { Metadata } from "next";
import Link from "next/link";
import { requireSeller } from "@/lib/auth/guards";
import { getCategoryOptions, getModerationSignals } from "@/server/services/catalog.service";
import { decideModeration } from "@/lib/validation/moderation";
import { ProductForm } from "@/components/dashboard/ProductForm";

export const metadata: Metadata = {
  title: "Add a product",
  robots: { index: false, follow: false },
};

export default async function NewProductPage() {
  const scope = await requireSeller();

  const [categories, signals] = await Promise.all([
    getCategoryOptions(),
    getModerationSignals(scope.sellerId),
  ]);

  // Tell the seller BEFORE they write anything whether this will be reviewed.
  // Finding out after filling in a long form reads as a rejection; knowing in
  // advance reads as a process.
  const decision = decideModeration(signals);

  return (
    <div className="max-w-2xl">
      <header className="mb-6">
        <Link href="/dashboard/products" className="text-sm text-neutral-500 hover:underline">
          ← Products
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Add a product</h1>
      </header>

      {decision.status === "PENDING" ? (
        <p className="mb-6 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {decision.reason}
        </p>
      ) : null}

      <ProductForm
        categories={categories}
        values={{
          name: "",
          slug: "",
          categoryId: null,
          shortDescription: null,
          description: null,
          brand: null,
          sku: null,
          modelNumber: null,
          price: "",
          priceMax: "",
          currency: "INR",
          unit: null,
          minOrderQty: null,
          // Matches the schema default: most listings on this kind of
          // marketplace are enquiry-led rather than priced.
          priceOnRequest: true,
          specifications: [],
          tags: [],
          images: [],
          metaTitle: null,
          metaDescription: null,
          status: "DRAFT",
        }}
      />
    </div>
  );
}
