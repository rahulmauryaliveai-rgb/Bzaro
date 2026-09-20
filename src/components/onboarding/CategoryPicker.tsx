"use client";

import { useId, useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";

/**
 * Category picker for seller registration (decision D34).
 *
 * The taxonomy has ~50 groups and ~400 subcategories, so a flat list is
 * unusable. This is the IndiaMART pattern: pick a group, then the
 * subcategory inside it (and a specialisation where the group goes a level
 * deeper). A search box over every subcategory name is the fast path for
 * sellers who already know their trade name.
 *
 * Posts the same fields the business-step schema expects:
 *   primaryCategoryId      the deepest node chosen for the main category
 *   secondaryCategoryIds[] up to `maxSecondary` more, added one at a time
 *
 * Only ids are posted; the server re-validates them against the table.
 */

export type CategoryOption = {
  id: string;
  name: string;
  children?: CategoryOption[];
};

type Picked = { id: string; label: string };

function findPath(groups: CategoryOption[], id: string): CategoryOption[] | null {
  for (const group of groups) {
    if (group.id === id) return [group];
    for (const sub of group.children ?? []) {
      if (sub.id === id) return [group, sub];
      for (const leaf of sub.children ?? []) {
        if (leaf.id === id) return [group, sub, leaf];
      }
    }
  }
  return null;
}

function labelFor(path: CategoryOption[]): string {
  return path.map((node) => node.name).join(" › ");
}

/** Cascading group → subcategory → specialisation selects. */
function Cascade({
  groups,
  value,
  onChange,
  idPrefix,
  required,
}: {
  groups: CategoryOption[];
  value: string;
  onChange: (id: string) => void;
  idPrefix: string;
  required?: boolean;
}) {
  const path = value ? (findPath(groups, value) ?? []) : [];
  const group = path[0] ?? null;
  const sub = path[1] ?? null;
  const leaf = path[2] ?? null;
  const subs = group?.children ?? [];
  const leaves = sub?.children ?? [];

  const selectClass = "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm";

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label
          htmlFor={`${idPrefix}-group`}
          className="mb-1 block text-xs font-medium text-neutral-600"
        >
          Category
        </label>
        <select
          id={`${idPrefix}-group`}
          value={group?.id ?? ""}
          onChange={(event) => onChange(event.currentTarget.value)}
          className={selectClass}
          required={required}
        >
          <option value="" disabled>
            Choose a category…
          </option>
          {groups.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-sub`}
          className="mb-1 block text-xs font-medium text-neutral-600"
        >
          Subcategory
        </label>
        <select
          id={`${idPrefix}-sub`}
          value={sub?.id ?? ""}
          onChange={(event) => onChange(event.currentTarget.value || (group?.id ?? ""))}
          className={selectClass}
          disabled={!group || subs.length === 0}
          required={required && subs.length > 0}
        >
          <option value="">
            {subs.length === 0 ? "No subcategories" : "Choose a subcategory…"}
          </option>
          {subs.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </div>

      {leaves.length > 0 ? (
        <div className="sm:col-span-2">
          <label
            htmlFor={`${idPrefix}-leaf`}
            className="mb-1 block text-xs font-medium text-neutral-600"
          >
            Specialisation <span className="font-normal text-neutral-400">(optional)</span>
          </label>
          <select
            id={`${idPrefix}-leaf`}
            value={leaf?.id ?? ""}
            onChange={(event) => onChange(event.currentTarget.value || (sub?.id ?? ""))}
            className={selectClass}
          >
            <option value="">All of {sub?.name}</option>
            {leaves.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}

export function CategoryPicker({
  groups,
  maxSecondary,
  errors,
}: {
  groups: CategoryOption[];
  maxSecondary: number;
  errors?: { primaryCategoryId?: string; secondaryCategoryIds?: string };
}) {
  const id = useId();
  const [primary, setPrimary] = useState("");
  const [secondary, setSecondary] = useState<Picked[]>([]);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");

  // Every subcategory and leaf, flattened once, for the search box.
  const index = useMemo(() => {
    const rows: Array<{ id: string; label: string; haystack: string }> = [];
    for (const group of groups) {
      for (const sub of group.children ?? []) {
        rows.push({
          id: sub.id,
          label: `${group.name} › ${sub.name}`,
          haystack: `${sub.name} ${group.name}`.toLowerCase(),
        });
        for (const leaf of sub.children ?? []) {
          rows.push({
            id: leaf.id,
            label: `${group.name} › ${sub.name} › ${leaf.name}`,
            haystack: `${leaf.name} ${sub.name} ${group.name}`.toLowerCase(),
          });
        }
      }
    }
    return rows;
  }, [groups]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return index.filter((row) => row.haystack.includes(q)).slice(0, 8);
  }, [index, query]);

  const primaryPath = primary ? findPath(groups, primary) : null;
  const primaryLabel = primaryPath ? labelFor(primaryPath) : null;

  function addSecondary() {
    if (!draft || draft === primary || secondary.some((item) => item.id === draft)) return;
    if (secondary.length >= maxSecondary) return;
    const path = findPath(groups, draft);
    if (!path) return;
    setSecondary((list) => [...list, { id: draft, label: labelFor(path) }]);
    setDraft("");
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-1 text-sm font-medium">Main category</p>
        <p className="mb-3 text-xs text-neutral-500">
          Where buyers find you first, and what buyer requirements are matched on.
        </p>

        <div className="relative mb-3">
          <Search
            className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-neutral-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search your trade, e.g. LED bulbs, TMT bars, sarees…"
            aria-label="Search categories"
            className="w-full rounded-md border border-neutral-300 py-2 pr-3 pl-9 text-sm"
          />
          {matches.length > 0 ? (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-neutral-200 bg-white shadow-lg">
              {matches.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setPrimary(row.id);
                      setQuery("");
                    }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-50"
                  >
                    {row.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <Cascade
          groups={groups}
          value={primary}
          onChange={setPrimary}
          idPrefix={`${id}-primary`}
          required
        />
        <input type="hidden" name="primaryCategoryId" value={primary} />
        {primaryLabel ? (
          <p className="mt-2 text-xs text-neutral-600">
            Selected: <span className="font-medium text-neutral-900">{primaryLabel}</span>
          </p>
        ) : null}
        {errors?.primaryCategoryId ? (
          <p className="mt-1 text-xs text-red-600">{errors.primaryCategoryId}</p>
        ) : null}
      </div>

      <div>
        <p className="mb-1 text-sm font-medium">
          Other categories{" "}
          <span className="font-normal text-neutral-500">
            (optional, up to {maxSecondary} · {secondary.length} added)
          </span>
        </p>
        <p className="mb-3 text-xs text-neutral-500">
          Add each additional trade you deal in. Buyers searching those categories will find you
          too.
        </p>

        {secondary.length > 0 ? (
          <ul className="mb-3 flex flex-wrap gap-2">
            {secondary.map((item) => (
              <li
                key={item.id}
                className="border-brand-200 bg-brand-50 text-brand-800 inline-flex items-center gap-1.5 rounded-full border py-1 pr-1.5 pl-3 text-xs font-medium"
              >
                {item.label}
                <input type="hidden" name="secondaryCategoryIds" value={item.id} />
                <button
                  type="button"
                  onClick={() =>
                    setSecondary((list) => list.filter((entry) => entry.id !== item.id))
                  }
                  aria-label={`Remove ${item.label}`}
                  className="hover:bg-brand-100 rounded-full p-0.5"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {secondary.length < maxSecondary ? (
          <div className="rounded-md border border-dashed border-neutral-300 p-3">
            <Cascade
              groups={groups}
              value={draft}
              onChange={setDraft}
              idPrefix={`${id}-secondary`}
            />
            <button
              type="button"
              onClick={addSecondary}
              disabled={!draft || draft === primary}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add category
            </button>
          </div>
        ) : null}
        {errors?.secondaryCategoryIds ? (
          <p className="mt-1 text-xs text-red-600">{errors.secondaryCategoryIds}</p>
        ) : null}
      </div>
    </div>
  );
}
