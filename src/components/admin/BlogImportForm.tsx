"use client";

import { useActionState } from "react";
import { importBlogDraftAction, type BlogFormState } from "@/server/actions/admin-blog";

const input =
  "w-full rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-neutral-100 placeholder:text-neutral-500";

const EXAMPLE = `---
title: How to choose LED panel lights for an office
slug: choose-led-panel-lights-office
summary: What to check before you order LED panels — wattage, lumens, colour temperature and warranty.
categories: electronics, lighting
---

## Start with the room

…`;

export function BlogImportForm({ authors }: { authors: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<BlogFormState, FormData>(
    importBlogDraftAction,
    {},
  );
  return (
    <form action={action} className="mt-6 space-y-4 text-sm">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-500">Author</span>
        <select name="authorId" defaultValue={authors[0]?.id ?? ""} className={input}>
          <option value="">—</option>
          {authors.map((author) => (
            <option key={author.id} value={author.id}>
              {author.name}
            </option>
          ))}
        </select>
      </label>
      <textarea
        name="markdown"
        required
        rows={24}
        placeholder={EXAMPLE}
        className={`${input} font-mono text-xs`}
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-white px-4 py-2 font-medium text-neutral-900 hover:bg-neutral-200 disabled:opacity-60"
        >
          {pending ? "Importing…" : "Import as draft"}
        </button>
        {state.error ? <span className="text-red-400">{state.error}</span> : null}
      </div>
    </form>
  );
}
