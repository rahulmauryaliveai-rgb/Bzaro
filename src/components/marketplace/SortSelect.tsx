"use client";

import { SORT_LABELS, SORT_OPTIONS } from "@/lib/validation/search";

/**
 * Sort control.
 *
 * A client component purely so the select can submit its own form on change.
 * The earlier version did this with an inline `<script>` — which is a second
 * `dangerouslySetInnerHTML`, and the XSS boundary does not get a carve-out for
 * a convenience feature. A few kilobytes of client JS is the honest price.
 *
 * It degrades correctly: the form is a real GET form with a submit button, so
 * sorting works with JavaScript disabled or still loading.
 */

export function SortSelect({
  value,
  hidden = {},
  action = "/search",
}: {
  value: string;
  hidden?: Record<string, string | undefined>;
  action?: string;
}) {
  return (
    <form action={action} method="get" className="flex items-center gap-2">
      {Object.entries(hidden).map(([name, v]) =>
        v ? <input key={name} type="hidden" name={name} value={v} /> : null,
      )}

      <label htmlFor="sort" className="text-sm whitespace-nowrap text-neutral-600">
        Sort by
      </label>

      <select
        id="sort"
        name="sort"
        defaultValue={value}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {SORT_LABELS[option]}
          </option>
        ))}
      </select>

      <noscript>
        <button type="submit" className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm">
          Apply
        </button>
      </noscript>
    </form>
  );
}
