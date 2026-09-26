"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { saveProductAction, type CatalogActionState } from "@/server/actions/catalog";
import { Field, SaveBanner, Section, Select, TextArea } from "@/components/dashboard/fields";
import { ImageUpload } from "@/components/dashboard/ImageUpload";
import { slugify } from "@/lib/utils/slug";

/**
 * Product editor.
 *
 * ── Why price is one field plus a checkbox, not a pricing mode ───────────────
 * Most listings on this kind of marketplace are "ask for price" — that is why
 * `priceOnRequest` defaults to true in the schema. The form makes the common
 * case one tick and hides the numbers when it is set, rather than asking every
 * seller to choose a pricing model before they can name their product.
 *
 * ── Specifications and images are repeatable rows, not JSON ─────────────────
 * Both post as parallel arrays of plain inputs, so the form works with
 * JavaScript disabled. The add/remove buttons are an enhancement on top; the
 * rows that are already rendered submit fine without them.
 */

const INITIAL: CatalogActionState = {};

export type ProductFormValues = {
  id?: string;
  name: string;
  slug: string;
  categoryId: string | null;
  shortDescription: string | null;
  description: string | null;
  brand: string | null;
  sku: string | null;
  modelNumber: string | null;
  price: string;
  priceMax: string;
  currency: string;
  unit: string | null;
  minOrderQty: number | null;
  priceOnRequest: boolean;
  specifications: Array<{ key: string; value: string }>;
  tags: string[];
  images: Array<{
    url: string;
    alt: string | null;
    publicId?: string | null;
    provider?: string | null;
    width?: number | null;
    height?: number | null;
    bytes?: number | null;
    mimeType?: string | null;
  }>;
  metaTitle: string | null;
  metaDescription: string | null;
  status: string;
};

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft — only you can see it" },
  { value: "PUBLISHED", label: "Published — visible on your website" },
  { value: "ARCHIVED", label: "Archived — hidden, kept for your records" },
];

/** One image row in the editor: the URL plus whatever the upload reported. */
type ImageRow = {
  url: string;
  alt: string;
  publicId?: string;
  provider?: string;
  width?: number | null;
  height?: number | null;
  bytes?: number | null;
  mimeType?: string;
};

/** Blank rows so there is always somewhere to type without pressing Add first. */
function padded<T>(rows: T[], blank: T, minimum: number): T[] {
  return rows.length >= minimum ? rows : [...rows, ...Array(minimum - rows.length).fill(blank)];
}

export function ProductForm({
  values,
  categories,
}: {
  values: ProductFormValues;
  categories: Array<{ id: string; name: string; depth: number }>;
}) {
  const [state, action, pending] = useActionState(saveProductAction, INITIAL);

  const [onRequest, setOnRequest] = useState(values.priceOnRequest);
  const [slug, setSlug] = useState(values.slug);
  const [slugTouched, setSlugTouched] = useState(Boolean(values.id));

  const [specs, setSpecs] = useState(() =>
    padded(values.specifications, { key: "", value: "" }, 3),
  );
  const [images, setImages] = useState<ImageRow[]>(() =>
    padded<ImageRow>(
      values.images.map((image) => ({
        url: image.url,
        alt: image.alt ?? "",
        publicId: image.publicId ?? "",
        provider: image.provider ?? "",
        width: image.width ?? null,
        height: image.height ?? null,
        bytes: image.bytes ?? null,
        mimeType: image.mimeType ?? "",
      })),
      { url: "", alt: "" },
      2,
    ),
  );

  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-6">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}

      <SaveBanner
        error={state.error}
        message={state.message}
        awaitingReview={state.awaitingReview}
      />

      <Section title="Product">
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium">
            Name
          </label>
          <input
            id="name"
            name="name"
            required
            maxLength={200}
            defaultValue={values.name}
            onChange={(event) => {
              // Only auto-fill the address until the seller edits it, and never
              // on an existing product — changing a live URL as a side effect
              // of fixing a typo in the name would break inbound links.
              if (!slugTouched) setSlug(slugify(event.currentTarget.value));
            }}
            aria-invalid={errors.name ? true : undefined}
            className={`w-full rounded-md border px-3 py-2 text-sm ${
              errors.name ? "border-red-500" : "border-neutral-300"
            }`}
          />
          {errors.name ? <p className="mt-1 text-xs text-red-600">{errors.name}</p> : null}
        </div>

        <div>
          <label htmlFor="slug" className="mb-1 block text-sm font-medium">
            Web address
          </label>
          {/*
            Controlled, so the name field can fill it in as you type — and so
            that editing it HERE stops the name from overwriting your choice.
          */}
          <input
            id="slug"
            name="slug"
            value={slug}
            maxLength={80}
            spellCheck={false}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.currentTarget.value.toLowerCase());
            }}
            aria-invalid={errors.slug ? true : undefined}
            className={`w-full rounded-md border px-3 py-2 font-mono text-sm ${
              errors.slug ? "border-red-500" : "border-neutral-300"
            }`}
          />
          {errors.slug ? (
            <p className="mt-1 text-xs text-red-600">{errors.slug}</p>
          ) : (
            <p className="mt-1 text-xs text-neutral-500">
              Your product page will be at /products/{slug || "…"}
            </p>
          )}
        </div>

        <Select
          label="Category"
          name="categoryId"
          defaultValue={values.categoryId ?? ""}
          placeholder="Uncategorised"
          error={errors.categoryId}
          hint="Decides where buyers find this on the marketplace."
          options={categories.map((category) => ({
            value: category.id,
            label: `${"— ".repeat(category.depth)}${category.name}`,
          }))}
        />

        <Field
          label="Short description"
          name="shortDescription"
          maxLength={300}
          defaultValue={values.shortDescription ?? ""}
          error={errors.shortDescription}
          hint="One line, shown on listing cards."
        />

        <TextArea
          label="Full description"
          name="description"
          rows={7}
          maxLength={5000}
          defaultValue={values.description ?? ""}
          error={errors.description}
        />
      </Section>

      <Section title="Price">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="priceOnRequest"
            checked={onRequest}
            onChange={(event) => setOnRequest(event.currentTarget.checked)}
          />
          <span>Ask for price — buyers enquire instead of seeing a number</span>
        </label>

        {/*
          The price inputs stay MOUNTED and are merely hidden when "ask for
          price" is ticked. Unmounting them would drop the values from the form
          payload, so a seller who ticks the box, saves, and unticks it later
          would silently lose the price they had typed.
        */}
        <div className={onRequest ? "hidden" : "space-y-4"} aria-hidden={onRequest}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Price"
              name="price"
              inputMode="decimal"
              defaultValue={values.price}
              error={errors.price}
              hint="In rupees, e.g. 1250"
            />
            <Field
              label="Up to (optional)"
              name="priceMax"
              inputMode="decimal"
              defaultValue={values.priceMax}
              error={errors.priceMax}
              hint="For a price range."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Per unit"
              name="unit"
              maxLength={40}
              defaultValue={values.unit ?? ""}
              error={errors.unit}
              hint="e.g. piece, kg, metre"
            />
            <Field
              label="Minimum order"
              name="minOrderQty"
              inputMode="numeric"
              defaultValue={values.minOrderQty ? String(values.minOrderQty) : ""}
              error={errors.minOrderQty}
            />
          </div>
        </div>

        <input type="hidden" name="currency" value={values.currency || "INR"} />
      </Section>

      <Section title="Identification" hint="All optional — helpful for buyers comparing suppliers.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Brand"
            name="brand"
            maxLength={100}
            defaultValue={values.brand ?? ""}
            error={errors.brand}
          />
          <Field
            label="SKU"
            name="sku"
            maxLength={60}
            defaultValue={values.sku ?? ""}
            error={errors.sku}
          />
          <Field
            label="Model number"
            name="modelNumber"
            maxLength={60}
            defaultValue={values.modelNumber ?? ""}
            error={errors.modelNumber}
          />
        </div>
      </Section>

      <Section
        title="Specifications"
        hint="Shown as a table on the product page. Leave a row blank to skip it."
      >
        <div className="space-y-2">
          {specs.map((spec, index) => (
            <div key={index} className="flex gap-2">
              <input
                name="specKey"
                defaultValue={spec.key}
                placeholder="Wattage"
                maxLength={60}
                className="w-1/3 rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
              <input
                name="specValue"
                defaultValue={spec.value}
                placeholder="40 W"
                maxLength={200}
                className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
          ))}
        </div>

        {errors.specifications ? (
          <p className="text-xs text-red-600">{errors.specifications}</p>
        ) : null}

        <button
          type="button"
          onClick={() => setSpecs([...specs, { key: "", value: "" }])}
          className="text-sm text-teal-700 underline underline-offset-2"
        >
          Add another row
        </button>
      </Section>

      <Section
        title="Images"
        hint="Upload from your phone or computer, or paste a link. The first image is used on listing cards."
      >
        <div className="space-y-4">
          {images.map((image, index) => (
            <div key={index} className="rounded-md border border-neutral-200 p-3">
              <ImageUpload
                target="product"
                label={`Image ${index + 1}`}
                value={image.url}
                hint="JPG, PNG or WebP, up to 8 MB."
                onChange={(asset) => {
                  const next = [...images];
                  next[index] = asset
                    ? {
                        url: asset.url,
                        alt: image.alt,
                        publicId: asset.publicId,
                        provider: asset.provider,
                        width: asset.width,
                        height: asset.height,
                        bytes: asset.bytes,
                        mimeType: asset.mimeType ?? "",
                      }
                    : { url: "", alt: image.alt };
                  setImages(next);
                }}
              />

              {/*
                The verified upload result travels to the server as ordinary
                hidden fields, so the whole form still submits in one go and
                nothing is written until the seller presses Save.
              */}
              <input type="hidden" name="imagePublicId" value={image.publicId ?? ""} />
              <input type="hidden" name="imageProvider" value={image.provider ?? ""} />
              <input type="hidden" name="imageWidth" value={image.width ?? ""} />
              <input type="hidden" name="imageHeight" value={image.height ?? ""} />
              <input type="hidden" name="imageBytes" value={image.bytes ?? ""} />
              <input type="hidden" name="imageMimeType" value={image.mimeType ?? ""} />

              <div className="mt-3 space-y-2">
                <input
                  name="imageAlt"
                  value={image.alt}
                  placeholder="Describe the image for buyers using a screen reader"
                  maxLength={200}
                  onChange={(event) => {
                    const next = [...images];
                    next[index] = { ...image, alt: event.currentTarget.value };
                    setImages(next);
                  }}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                />

                {/*
                  The paste-a-link escape hatch stays. Uploads need a configured
                  provider, and a seller whose photograph already lives on their
                  old website should not have to download and re-upload it.
                */}
                {/*
                  The canonical `imageUrl` field. Named here rather than
                  mirrored into a hidden input, so pasting a link keeps working
                  without JavaScript — uploading needs scripting, typing an
                  address does not.
                */}
                <details open={Boolean(image.url)}>
                  <summary className="cursor-pointer text-xs text-neutral-500">
                    Or paste an image link
                  </summary>
                  <input
                    type="text"
                    inputMode="url"
                    name="imageUrl"
                    value={image.url}
                    placeholder="https://…"
                    maxLength={2048}
                    onChange={(event) => {
                      const next = [...images];
                      // A pasted link has no provider metadata, and claiming
                      // otherwise would make the row look like one of our own
                      // uploads — which is what decides whether it can later be
                      // deleted from the CDN.
                      next[index] = { url: event.currentTarget.value, alt: image.alt };
                      setImages(next);
                    }}
                    className="mt-2 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  />
                </details>
              </div>
            </div>
          ))}
        </div>

        {errors.images ? <p className="text-xs text-red-600">{errors.images}</p> : null}

        <button
          type="button"
          onClick={() => setImages([...images, { url: "", alt: "" }])}
          className="text-sm text-teal-700 underline underline-offset-2"
        >
          Add another image
        </button>
      </Section>

      <Section title="Finding this product">
        <TextArea
          label="Tags"
          name="tags"
          rows={2}
          defaultValue={values.tags.join(", ")}
          error={errors.tags}
          hint="Comma separated or one per line. Helps buyers searching for other words."
        />

        <Field
          label="Search title"
          name="metaTitle"
          maxLength={70}
          defaultValue={values.metaTitle ?? ""}
          error={errors.metaTitle}
          hint="Leave blank to use the product name."
        />

        <Field
          label="Search description"
          name="metaDescription"
          maxLength={180}
          defaultValue={values.metaDescription ?? ""}
          error={errors.metaDescription}
          hint="Leave blank to use the short description."
        />
      </Section>

      <Section title="Visibility">
        <Select
          label="Status"
          name="status"
          defaultValue={values.status}
          options={STATUS_OPTIONS}
          error={errors.status}
        />
      </Section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : values.id ? "Save product" : "Create product"}
        </button>
        {values.id ? (
          <Link
            href="/dashboard/products/new"
            className="rounded-md border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
          >
            + Add another product
          </Link>
        ) : null}
      </div>
    </form>
  );
}
