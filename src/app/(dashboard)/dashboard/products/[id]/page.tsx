import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSeller, scopeSurface } from "@/lib/auth/guards";
import { getCategoryOptions, getProductForEdit } from "@/server/services/catalog.service";
import { ProductForm } from "@/components/dashboard/ProductForm";
import { DeleteCatalogItem } from "@/components/dashboard/DeleteCatalogItem";
import { specificationsSchema } from "@/lib/validation/catalog";
import { minorToMajorString } from "@/lib/utils/money";
import { sellerSiteUrl } from "@/lib/utils/url";

export const metadata: Metadata = {
  title: "Edit product",
  robots: { index: false, follow: false },
};

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const scope = await requireSeller();
  const { id } = await params;
  const { created } = await searchParams;

  const [product, categories] = await Promise.all([
    getProductForEdit(scope.sellerId, id),
    getCategoryOptions(),
  ]);

  // Tenant-scoped read, so another seller's id is simply not found rather than
  // forbidden — which also avoids confirming that the id exists at all.
  if (!product) notFound();

  // The column is JSON and may hold rows written by an older shape. Parse and
  // fall back rather than throwing inside the editor the seller needs in order
  // to fix it.
  const parsedSpecs = specificationsSchema.safeParse(product.specifications ?? []);

  const live = product.status === "PUBLISHED" && product.moderationStatus === "APPROVED";

  return (
    <div className="max-w-2xl">
      <header className="mb-6">
        <Link href="/dashboard/products" className="text-sm text-neutral-500 hover:underline">
          ← Products
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{product.name}</h1>

        {live ? (
          <a
            href={sellerSiteUrl(scopeSurface(scope), `/products/${product.slug}`)}
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
            Product saved.{" "}
            {product.status !== "PUBLISHED"
              ? "It stays a draft until you set it to Published below."
              : live
                ? "It is live."
                : "It goes live as soon as your business is verified."}
          </span>
          <Link
            href="/dashboard/products/new"
            className="rounded-md bg-teal-700 px-3 py-1.5 font-medium text-white hover:bg-teal-800"
          >
            + Add another product
          </Link>
        </div>
      ) : null}

      {product.status === "PUBLISHED" && product.moderationStatus === "PENDING" ? (
        <p className="mb-6 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Saved. It appears on your website and the marketplace as soon as your business is verified.
        </p>
      ) : null}

      {product.moderationStatus === "REJECTED" ? (
        <p className="mb-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          This listing was rejected during review and is not public. Check your email for what to
          change, then edit and save it to submit it again.
        </p>
      ) : null}

      <ProductForm
        categories={categories}
        values={{
          id: product.id,
          name: product.name,
          slug: product.slug,
          categoryId: product.categoryId,
          shortDescription: product.shortDescription,
          description: product.description,
          brand: product.brand,
          sku: product.sku,
          modelNumber: product.modelNumber,
          price: minorToMajorString(product.priceMinor, product.currency),
          priceMax: minorToMajorString(product.priceMaxMinor, product.currency),
          currency: product.currency,
          unit: product.unit,
          minOrderQty: product.minOrderQty,
          priceOnRequest: product.priceOnRequest,
          specifications: parsedSpecs.success ? parsedSpecs.data : [],
          tags: product.tags,
          images: product.images.map((image) => ({ url: image.url, alt: image.alt })),
          metaTitle: product.metaTitle,
          metaDescription: product.metaDescription,
          status: product.status,
        }}
      />

      <div className="mt-8">
        <DeleteCatalogItem kind="product" id={product.id} name={product.name} />
      </div>
    </div>
  );
}
