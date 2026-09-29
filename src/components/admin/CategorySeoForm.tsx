"use client";

import { useActionState, useState } from "react";
import { RichTextEditor } from "@/components/dashboard/RichTextEditor";
import { updateCategorySeoAction, type CategorySeoState } from "@/server/actions/admin-taxonomy";
import { FAQ_MAX, SEO_DESCRIPTION_MAX, SEO_TITLE_MAX, type FaqItem } from "@/lib/validation/seo";

/** Admin editor for a category page's SEO fields and content (D44). */

const input =
  "w-full rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-neutral-100 placeholder:text-neutral-500";

export function CategorySeoForm({
  category,
  defaults,
}: {
  category: {
    id: string;
    metaTitle: string;
    metaDescription: string;
    description: string;
    ogImageUrl: string;
    noindex: boolean;
    faqs: FaqItem[];
  };
  defaults: { title: string; description: string };
}) {
  const [state, action, pending] = useActionState<CategorySeoState, FormData>(
    updateCategorySeoAction,
    {},
  );
  const [title, setTitle] = useState(category.metaTitle);
  const [description, setDescription] = useState(category.metaDescription);
  const [faqRows, setFaqRows] = useState(Math.max(category.faqs.length, 2));

  return (
    <form action={action} className="mt-6 space-y-6 text-sm">
      <input type="hidden" name="id" value={category.id} />

      <section className="space-y-4 rounded-lg border border-neutral-700 bg-neutral-800 p-5">
        <h2 className="text-sm font-semibold tracking-wide text-neutral-400 uppercase">
          Search result
        </h2>
        <label className="flex flex-col gap-1">
          <span className="flex justify-between text-xs text-neutral-500">
            <span>SEO title (blank = automatic)</span>
            <Counter value={title} max={60} hard={SEO_TITLE_MAX} />
          </span>
          <input
            name="metaTitle"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={SEO_TITLE_MAX}
            placeholder={defaults.title}
            className={input}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="flex justify-between text-xs text-neutral-500">
            <span>Meta description (blank = automatic)</span>
            <Counter value={description} max={155} hard={SEO_DESCRIPTION_MAX} />
          </span>
          <textarea
            name="metaDescription"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={SEO_DESCRIPTION_MAX}
            rows={3}
            placeholder={defaults.description}
            className={input}
          />
        </label>
        <GooglePreview
          title={`${title || defaults.title} | Bzaro`}
          description={description || defaults.description}
        />
        <label className="flex flex-col gap-1">
          <span className="text-xs text-neutral-500">
            Share image URL (WhatsApp, LinkedIn, X) — blank uses the category tile
          </span>
          <input
            name="ogImageUrl"
            defaultValue={category.ogImageUrl}
            placeholder="https://res.cloudinary.com/…"
            className={input}
          />
        </label>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            name="noindex"
            defaultChecked={category.noindex}
            className="mt-0.5"
          />
          <span>
            Hide this category page from Google
            <span className="block text-xs text-neutral-500">
              Only for duplicates or pages being reorganised. Empty categories are already hidden
              automatically.
            </span>
          </span>
        </label>
      </section>

      <section className="space-y-3 rounded-lg border border-neutral-700 bg-neutral-800 p-5">
        <h2 className="text-sm font-semibold tracking-wide text-neutral-400 uppercase">
          Introduction
        </h2>
        <p className="text-xs text-neutral-500">
          Shown under the heading. 80–200 words is plenty: what this covers, what to compare, what
          to mention when you enquire.
        </p>
        <div className="rounded-md bg-white p-3 text-neutral-900">
          <RichTextEditor
            id="category-intro"
            name="description"
            defaultValue={category.description}
            rows={8}
            maxLength={4000}
            placeholder="LED lights for shops, offices and factories — panels, bulbs, tubes and floodlights…"
          />
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-neutral-700 bg-neutral-800 p-5">
        <h2 className="text-sm font-semibold tracking-wide text-neutral-400 uppercase">
          Buyer questions (FAQ)
        </h2>
        <p className="text-xs text-neutral-500">
          Real questions buyers ask about this category. Leave a row blank to remove it.
        </p>
        {Array.from({ length: faqRows }, (_, index) => (
          <div key={index} className="space-y-2 rounded-md border border-neutral-700 p-3">
            <input
              name={`faq_q_${index}`}
              defaultValue={category.faqs[index]?.q ?? ""}
              maxLength={200}
              placeholder={`Question ${index + 1}`}
              className={input}
            />
            <textarea
              name={`faq_a_${index}`}
              defaultValue={category.faqs[index]?.a ?? ""}
              maxLength={1200}
              rows={3}
              placeholder="Answer"
              className={input}
            />
          </div>
        ))}
        {faqRows < FAQ_MAX ? (
          <button
            type="button"
            onClick={() => setFaqRows((rows) => Math.min(rows + 1, FAQ_MAX))}
            className="rounded-md border border-neutral-600 px-3 py-1.5 hover:bg-neutral-700"
          >
            Add a question
          </button>
        ) : null}
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-white px-4 py-2 font-medium text-neutral-900 hover:bg-neutral-200 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {state.ok ? <span className="text-emerald-400">Saved.</span> : null}
        {state.error ? <span className="text-red-400">{state.error}</span> : null}
      </div>
    </form>
  );
}

function Counter({ value, max, hard }: { value: string; max: number; hard: number }) {
  const length = value.trim().length;
  const tone =
    length === 0 ? "text-neutral-500" : length > max ? "text-amber-400" : "text-emerald-400";
  return (
    <span className={`tabular-nums ${tone}`}>
      {length}/{max}
      {length > max ? ` (may be cut; max ${hard})` : ""}
    </span>
  );
}

function GooglePreview({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-md bg-white p-3 font-sans">
      <p className="text-xs text-neutral-600">bzaro.in › category</p>
      <p className="truncate text-lg leading-snug text-[#1a0dab]">{title}</p>
      <p className="line-clamp-2 text-sm text-neutral-700">{description}</p>
    </div>
  );
}
