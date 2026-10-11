import type { Metadata } from "next";
import Link from "next/link";
import { requireSeller } from "@/lib/auth/guards";
import { ImportSteps } from "@/components/dashboard/ImportSteps";
import { BulkPhotoUpload } from "@/components/dashboard/BulkPhotoUpload";
import { listAssignableProductsAction } from "@/server/actions/import-photos";
import { uploadsAvailable } from "@/lib/media";

export const metadata: Metadata = {
  title: "Bulk photo upload",
  robots: { index: false, follow: false },
};

/**
 * Step 3 — photos in bulk (D49).
 *
 * The page is a shell: the work is in `BulkPhotoUpload`, which has to be a
 * client component because selecting files, matching names and driving three
 * concurrent uploads with a progress bar are all browser-side.
 *
 * Unlike the rest of this dashboard, this step genuinely needs JavaScript —
 * there is no no-JS way to upload five hundred files to a CDN with retries.
 * The single-product editor remains the fallback, and is pointed at below when
 * uploads are unavailable.
 */
export default async function BulkPhotosPage() {
  await requireSeller();

  // Products with a SKU, which is what a photo can be matched to.
  const products = await listAssignableProductsAction();

  const withoutPhotos = products.filter((product) => product.imageCount === 0).length;

  return (
    <div className="max-w-4xl">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Add photos in bulk</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Name each photo after its product code, then upload them all together.
        </p>
      </header>

      <ImportSteps current={3} />

      {!uploadsAvailable ? (
        <p className="rounded-md bg-amber-50 px-3 py-3 text-sm text-amber-900">
          Photo uploads are not set up on this deployment. You can still add a photo link on each
          product from the{" "}
          <Link href="/dashboard/products" className="underline underline-offset-2">
            products page
          </Link>
          .
        </p>
      ) : (
        <>
          {withoutPhotos > 0 ? (
            <p className="mb-5 rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-700">
              {withoutPhotos} of your products have no photo yet.{" "}
              <Link
                href="/dashboard/products?filter=missing-photos"
                className="underline underline-offset-2"
              >
                See which ones
              </Link>
            </p>
          ) : null}

          <BulkPhotoUpload products={products} />

          <section className="mt-8 rounded-lg border border-neutral-200 bg-white p-5">
            <h2 className="text-sm font-semibold tracking-wide text-neutral-500 uppercase">
              How to name your photos
            </h2>

            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex flex-wrap gap-x-3">
                <dt className="font-mono text-xs sm:w-48">LED-9W-CW.jpg</dt>
                <dd className="text-neutral-600">Main photo of product LED-9W-CW</dd>
              </div>
              <div className="flex flex-wrap gap-x-3">
                <dt className="font-mono text-xs sm:w-48">LED-9W-CW_2.jpg</dt>
                <dd className="text-neutral-600">Second photo, and so on up to _12</dd>
              </div>
            </dl>

            <p className="mt-3 text-xs text-neutral-500">
              Capital or small letters do not matter. Photos are only matched to your own products.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
