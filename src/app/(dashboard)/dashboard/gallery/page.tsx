import type { Metadata } from "next";
import { requireSeller, scopeSurface } from "@/lib/auth/guards";
import { listGalleryItems } from "@/server/services/gallery.service";
import { MAX_GALLERY_ITEMS } from "@/lib/validation/gallery";
import { GalleryAddForm } from "@/components/dashboard/GalleryAddForm";
import { GalleryItemCard } from "@/components/dashboard/GalleryItemCard";
import { sellerSiteUrl } from "@/lib/utils/url";

export const metadata: Metadata = {
  title: "Gallery",
  robots: { index: false, follow: false },
};

export default async function GalleryPage() {
  const scope = await requireSeller();

  const items = await listGalleryItems(scope.sellerId);
  const remaining = MAX_GALLERY_ITEMS - items.length;

  const missingAlt = items.filter((item) => !item.alt).length;

  return (
    <div className="max-w-3xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Gallery</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Photographs of your work, premises or team.{" "}
          <a
            href={sellerSiteUrl(scopeSurface(scope), "/gallery")}
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal-700 underline underline-offset-2"
          >
            View your gallery ↗
          </a>
        </p>

        {/*
          There is no draft state here, unlike products. Saying so plainly is
          cheaper than letting a seller discover it by uploading something they
          were not ready to show.
        */}
        <p className="mt-2 text-sm text-neutral-600">
          Images appear on your website as soon as they are added — there is no separate publish
          step.
        </p>
      </header>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-neutral-500 uppercase">
          Add images
        </h2>
        <GalleryAddForm remaining={remaining} />
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-wide text-neutral-500 uppercase">
            Your gallery
          </h2>
          <span className="text-xs text-neutral-500">
            {items.length} of {MAX_GALLERY_ITEMS}
          </span>
        </div>

        {missingAlt > 0 ? (
          <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {missingAlt} image{missingAlt === 1 ? " has" : "s have"} no description. Descriptions
            are what buyers using a screen reader hear, and the only text a search engine can read
            in a photograph.
          </p>
        ) : null}

        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center">
            <h3 className="font-medium">No photographs yet</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-neutral-600">
              A gallery is often what persuades a buyer you are a real business. Photographs of your
              workshop, your team or finished work all do more than a stock image.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((item, index) => (
              <GalleryItemCard
                key={item.id}
                item={item}
                position={index + 1}
                total={items.length}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
