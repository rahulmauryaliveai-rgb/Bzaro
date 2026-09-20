"use client";

import { useActionState, useState } from "react";
import { saveServiceAction, type CatalogActionState } from "@/server/actions/catalog";
import { Field, SaveBanner, Section, Select, TextArea } from "@/components/dashboard/fields";
import { ImageUpload } from "@/components/dashboard/ImageUpload";
import { slugify } from "@/lib/utils/slug";

/**
 * Service editor.
 *
 * Deliberately NOT the product form with fields hidden. A service has no SKU,
 * no stock unit and no image gallery — it has a pricing model and a list of
 * areas it is offered in. Reusing the product form would put stock-keeping
 * vocabulary in front of a consultancy, which is how a form starts feeling like
 * it was built for somebody else.
 */

const INITIAL: CatalogActionState = {};

export type ServiceFormValues = {
  id?: string;
  name: string;
  slug: string;
  categoryId: string | null;
  shortDescription: string | null;
  description: string | null;
  price: string;
  currency: string;
  pricingModel: string | null;
  priceOnRequest: boolean;
  serviceAreas: string[];
  imageUrl: string | null;
  tags: string[];
  metaTitle: string | null;
  metaDescription: string | null;
  status: string;
};

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft — only you can see it" },
  { value: "PUBLISHED", label: "Published — visible on your website" },
  { value: "ARCHIVED", label: "Archived — hidden, kept for your records" },
];

const PRICING_MODELS = [
  { value: "quote", label: "Quoted per job" },
  { value: "hourly", label: "Hourly rate" },
  { value: "fixed", label: "Fixed price" },
];

export function ServiceForm({
  values,
  categories,
}: {
  values: ServiceFormValues;
  categories: Array<{ id: string; name: string; depth: number }>;
}) {
  const [state, action, pending] = useActionState(saveServiceAction, INITIAL);

  const [onRequest, setOnRequest] = useState(values.priceOnRequest);
  const [slug, setSlug] = useState(values.slug);
  const [slugTouched, setSlugTouched] = useState(Boolean(values.id));
  const [imageUrl, setImageUrl] = useState(values.imageUrl ?? "");

  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-6">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}

      <SaveBanner
        error={state.error}
        message={state.message}
        awaitingReview={state.awaitingReview}
      />

      <Section title="Service">
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
              Your service page will be at /services/{slug || "…"}
            </p>
          )}
        </div>

        <Select
          label="Category"
          name="categoryId"
          defaultValue={values.categoryId ?? ""}
          placeholder="Uncategorised"
          error={errors.categoryId}
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

        {/* Hidden rather than unmounted, so a typed price is not lost. */}
        <div className={onRequest ? "hidden" : "space-y-4"} aria-hidden={onRequest}>
          <Select
            label="How you charge"
            name="pricingModel"
            defaultValue={values.pricingModel ?? ""}
            placeholder="Not set"
            options={PRICING_MODELS}
            error={errors.pricingModel}
          />

          <Field
            label="Price"
            name="price"
            inputMode="decimal"
            defaultValue={values.price}
            error={errors.price}
            hint="In rupees, e.g. 2500"
          />
        </div>

        <input type="hidden" name="currency" value={values.currency || "INR"} />
      </Section>

      <Section title="Where you offer it">
        <TextArea
          label="Service areas"
          name="serviceAreas"
          rows={3}
          defaultValue={values.serviceAreas.join("\n")}
          error={errors.serviceAreas}
          hint="One per line, or comma separated. e.g. Mumbai, Pune, Nashik"
        />
      </Section>

      <Section title="Image">
        <ImageUpload
          target="product"
          label="Image"
          value={imageUrl}
          hint="JPG, PNG or WebP, up to 8 MB."
          onChange={(asset) => setImageUrl(asset?.url ?? "")}
        />
        {errors.imageUrl ? <p className="text-xs text-red-600">{errors.imageUrl}</p> : null}

        {/* Named here so pasting a link works without JavaScript. */}
        <details open={Boolean(imageUrl)}>
          <summary className="cursor-pointer text-xs text-neutral-500">
            Or paste an image link
          </summary>
          <input
            type="text"
            inputMode="url"
            name="imageUrl"
            value={imageUrl}
            onChange={(event) => setImageUrl(event.currentTarget.value)}
            placeholder="https://…"
            maxLength={2048}
            className="mt-2 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </details>
      </Section>

      <Section title="Finding this service">
        <TextArea
          label="Tags"
          name="tags"
          rows={2}
          defaultValue={values.tags.join(", ")}
          error={errors.tags}
          hint="Comma separated or one per line."
        />

        <Field
          label="Search title"
          name="metaTitle"
          maxLength={70}
          defaultValue={values.metaTitle ?? ""}
          error={errors.metaTitle}
          hint="Leave blank to use the service name."
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

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
      >
        {pending ? "Saving…" : values.id ? "Save service" : "Create service"}
      </button>
    </form>
  );
}
