"use client";

import { useActionState, useState } from "react";
import { RichTextEditor } from "@/components/dashboard/RichTextEditor";
import { saveBlogPostAction, type BlogFormState } from "@/server/actions/admin-blog";

/**
 * Blog article editor (D45). The body uses the article markers — headings
 * and links on top of bold/italic/lists — and Preview shows it as readers
 * will see it. Tags (categories, products, suppliers) drive the internal
 * links; nothing is inserted into the body automatically.
 */

type PostValues = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  coverImageUrl: string;
  coverImageAlt: string;
  authorId: string;
  metaTitle: string;
  metaDescription: string;
  ogImageUrl: string;
  canonicalUrl: string;
  noindex: boolean;
  categoryIds: string[];
  productRefs: string;
  sellerRefs: string;
  publishedOn: string;
  status: "DRAFT" | "PUBLISHED";
};

const input =
  "w-full rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-neutral-100 placeholder:text-neutral-500";
const label = "text-xs text-neutral-500";

export function BlogPostForm({
  post,
  authors,
  categories,
}: {
  post: PostValues | null;
  authors: { id: string; name: string }[];
  categories: { id: string; label: string }[];
}) {
  const [state, action, pending] = useActionState<BlogFormState, FormData>(saveBlogPostAction, {});
  const [title, setTitle] = useState(post?.title ?? "");
  const [metaTitle, setMetaTitle] = useState(post?.metaTitle ?? "");
  const [metaDescription, setMetaDescription] = useState(post?.metaDescription ?? "");
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");
  const [words, setWords] = useState(countWords(post?.body ?? ""));
  const [publishOn, setPublishOn] = useState(post?.publishedOn ?? "");
  // A future date turns "Publish" into "Schedule": it goes live that day at 09:00 IST.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const isFuture = publishOn !== "" && publishOn > today;
  const published = post?.status === "PUBLISHED";

  return (
    <form action={action} className="mt-6 space-y-6 text-sm">
      <input type="hidden" name="id" value={post?.id ?? ""} />

      <section className="space-y-4 rounded-lg border border-neutral-700 bg-neutral-800 p-5">
        <label className="flex flex-col gap-1">
          <span className={label}>Title (the H1 readers see)</span>
          <input
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            minLength={5}
            maxLength={140}
            className={`${input} text-base`}
            placeholder="How to choose LED panel lights for an office"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={label}>URL slug (blank = from the title)</span>
            <input
              name="slug"
              defaultValue={post?.slug ?? ""}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              maxLength={100}
              className={`${input} font-mono`}
              placeholder="choose-led-panel-lights-office"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={label}>Author (required to publish)</span>
            <select name="authorId" defaultValue={post?.authorId ?? ""} className={input}>
              <option value="">—</option>
              {authors.map((author) => (
                <option key={author.id} value={author.id}>
                  {author.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="flex justify-between text-xs text-neutral-500">
            <span>Summary — one or two sentences for the blog list and search snippet</span>
            <span className="tabular-nums">{excerpt.length}/300</span>
          </span>
          <textarea
            name="excerpt"
            value={excerpt}
            onChange={(event) => setExcerpt(event.target.value)}
            maxLength={300}
            rows={2}
            className={input}
          />
        </label>
      </section>

      <section className="space-y-3 rounded-lg border border-neutral-700 bg-neutral-800 p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold tracking-wide text-neutral-400 uppercase">
            Article
          </h2>
          <span className="text-xs text-neutral-500 tabular-nums">
            {words} words · ~{Math.max(1, Math.round(words / 200))} min read
          </span>
        </div>
        <p className="text-xs text-neutral-500">
          Write from real experience: what buyers should check, typical prices or MOQs, mistakes to
          avoid. Use headings for each question. Link to categories and suppliers where it genuinely
          helps the reader — e.g. [LED panel suppliers](/category/electronics/lighting).
        </p>
        <div className="rounded-md bg-white p-3 text-neutral-900">
          <RichTextEditor
            id="blog-body"
            name="body"
            defaultValue={post?.body ?? ""}
            rows={22}
            maxLength={60000}
            article
            onValueChange={(value) => setWords(countWords(value))}
            placeholder={"## What to check first\n\nStart with the wattage and the lumen output…"}
          />
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border border-neutral-700 bg-neutral-800 p-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={label}>Cover image URL</span>
          <input
            name="coverImageUrl"
            defaultValue={post?.coverImageUrl ?? ""}
            className={input}
            placeholder="https://res.cloudinary.com/…"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={label}>Cover image description (alt text)</span>
          <input
            name="coverImageAlt"
            defaultValue={post?.coverImageAlt ?? ""}
            maxLength={200}
            className={input}
            placeholder="LED panel lights installed in an office ceiling"
          />
        </label>
      </section>

      <section className="space-y-4 rounded-lg border border-neutral-700 bg-neutral-800 p-5">
        <h2 className="text-sm font-semibold tracking-wide text-neutral-400 uppercase">
          What this article is about (internal links)
        </h2>
        <label className="flex flex-col gap-1">
          <span className={label}>
            Categories (Ctrl/⌘-click for several) — the article appears on these category pages
          </span>
          <select
            name="categoryIds"
            multiple
            size={8}
            defaultValue={post?.categoryIds ?? []}
            className={input}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={label}>Products — paste product links, one per line</span>
            <textarea
              name="productRefs"
              defaultValue={post?.productRefs ?? ""}
              rows={4}
              className={`${input} font-mono text-xs`}
              placeholder="https://bzaro.in/product/aggarwal-printer/customised-school-notebooks"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={label}>Suppliers — paste profile links or slugs, one per line</span>
            <textarea
              name="sellerRefs"
              defaultValue={post?.sellerRefs ?? ""}
              rows={4}
              className={`${input} font-mono text-xs`}
              placeholder="https://bzaro.in/seller/aggarwal-printer"
            />
          </label>
        </div>
      </section>

      <details
        className="rounded-lg border border-neutral-700 bg-neutral-800 p-5"
        open={Boolean(metaTitle || metaDescription || post?.publishedOn)}
      >
        <summary className="cursor-pointer text-sm font-semibold tracking-wide text-neutral-400 uppercase">
          Search & sharing
        </summary>
        <div className="mt-4 space-y-4">
          <label className="flex flex-col gap-1">
            <span className="flex justify-between text-xs text-neutral-500">
              <span>SEO title (blank = the title)</span>
              <span className="tabular-nums">{metaTitle.length}/60</span>
            </span>
            <input
              name="metaTitle"
              value={metaTitle}
              onChange={(event) => setMetaTitle(event.target.value)}
              maxLength={70}
              className={input}
              placeholder={title}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="flex justify-between text-xs text-neutral-500">
              <span>Meta description (blank = the summary)</span>
              <span className="tabular-nums">{metaDescription.length}/155</span>
            </span>
            <textarea
              name="metaDescription"
              value={metaDescription}
              onChange={(event) => setMetaDescription(event.target.value)}
              maxLength={170}
              rows={2}
              className={input}
              placeholder={excerpt}
            />
          </label>
          <div className="rounded-md bg-white p-3">
            <p className="text-xs text-neutral-600">bzaro.in › blog</p>
            <p className="truncate text-lg text-[#1a0dab]">
              {(metaTitle || title || "Title") + " | Bzaro"}
            </p>
            <p className="line-clamp-2 text-sm text-neutral-700">
              {metaDescription || excerpt || "Summary"}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className={label}>Share image (blank = cover image)</span>
              <input name="ogImageUrl" defaultValue={post?.ogImageUrl ?? ""} className={input} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={label}>
                Publication date — a future date schedules it (goes live 09:00 IST)
              </span>
              <input
                type="date"
                name="publishedOn"
                value={publishOn}
                onChange={(event) => setPublishOn(event.target.value)}
                className={input}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className={label}>
              Canonical URL — only if this article was first published on another site
            </span>
            <input name="canonicalUrl" defaultValue={post?.canonicalUrl ?? ""} className={input} />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="noindex" defaultChecked={post?.noindex ?? false} />
            <span>Hide this article from Google</span>
          </label>
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          name="intent"
          value="draft"
          disabled={pending}
          className="rounded-md border border-neutral-600 px-4 py-2 hover:bg-neutral-700 disabled:opacity-60"
        >
          {published ? "Save changes" : "Save draft"}
        </button>
        {published ? (
          <button
            type="submit"
            name="intent"
            value="unpublish"
            disabled={pending}
            className="rounded-md border border-red-900 px-4 py-2 text-red-300 hover:bg-red-950 disabled:opacity-60"
          >
            Unpublish
          </button>
        ) : (
          <button
            type="submit"
            name="intent"
            value="publish"
            disabled={pending}
            className="rounded-md bg-white px-4 py-2 font-medium text-neutral-900 hover:bg-neutral-200 disabled:opacity-60"
          >
            {isFuture ? "Schedule" : "Publish"}
          </button>
        )}
        {pending ? <span className="text-neutral-400">Saving…</span> : null}
        {state.message ? <span className="text-emerald-400">{state.message}</span> : null}
        {state.error ? <span className="text-red-400">{state.error}</span> : null}
      </div>
    </form>
  );
}

function countWords(text: string): number {
  const bare = text.replace(/[#*_[\]()-]/g, " ").trim();
  return bare ? bare.split(/\s+/).length : 0;
}
