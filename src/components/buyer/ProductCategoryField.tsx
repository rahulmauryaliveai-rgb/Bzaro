"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Search } from "lucide-react";
import { suggestCategoriesAction } from "@/server/actions/category-suggest";
import type { CategorySuggestion } from "@/server/services/category-suggest.service";

/**
 * "What do you need?" + category, as one step (D43).
 *
 * The buyer types the product the way they think of it; matching categories
 * appear underneath ("LED Bulbs & Tubes · Electrical › Lighting") and one tap
 * picks it. The best match is pre-selected so a buyer who never looks down
 * still posts into a sensible category, and "Browse all categories" remains
 * for anyone who prefers to pick from the list.
 *
 * Posts `productName` and `categoryId` exactly like the old two fields did.
 */

type Option = { id: string; name: string };

const inputClass = (error?: string) =>
  `w-full rounded-md border px-3 py-2 text-sm ${error ? "border-red-500" : "border-neutral-300"}`;

export function ProductCategoryField({
  categories,
  defaultProduct,
  defaultCategoryId,
  productError,
  categoryError,
}: {
  /** Top-level groups, for the "browse" fallback. */
  categories: Option[];
  defaultProduct?: string;
  defaultCategoryId?: string;
  productError?: string;
  categoryError?: string;
}) {
  const [query, setQuery] = useState(defaultProduct ?? "");
  const [suggestions, setSuggestions] = useState<CategorySuggestion[]>([]);
  const [selected, setSelected] = useState<CategorySuggestion | null>(null);
  // A ref, not state: choosing a category must not re-run the search.
  const pickedByHand = useRef(false);
  const [browse, setBrowse] = useState(
    Boolean(defaultCategoryId && categories.some((category) => category.id === defaultCategoryId)),
  );
  const [browseValue, setBrowseValue] = useState(defaultCategoryId ?? "");
  const [searched, setSearched] = useState(false);
  const [pending, startTransition] = useTransition();
  const latest = useRef("");

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setSearched(false);
      return;
    }
    const timer = setTimeout(() => {
      latest.current = q;
      startTransition(async () => {
        const result = await suggestCategoriesAction(q);
        if (latest.current !== q) return; // a newer keystroke won
        setSuggestions(result);
        setSearched(true);
        // Pre-select the best match until the buyer chooses one themselves.
        if (!pickedByHand.current) setSelected(result[0] ?? null);
      });
    }, 280);
    return () => clearTimeout(timer);
  }, [query]);

  const categoryId = browse ? browseValue : (selected?.id ?? "");

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="productName" className="mb-1 block text-sm font-medium">
          What do you need?
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-400"
            aria-hidden="true"
          />
          <input
            id="productName"
            name="productName"
            required
            maxLength={200}
            autoComplete="off"
            value={query}
            onChange={(event) => {
              // A new product means a new best match.
              pickedByHand.current = false;
              setQuery(event.currentTarget.value);
            }}
            placeholder="e.g. LED bulb 9W, CCTV camera, corrugated boxes"
            aria-invalid={productError ? true : undefined}
            aria-describedby="category-suggestions"
            className={`${inputClass(productError)} pl-9`}
          />
        </div>
        {productError ? <p className="mt-1 text-xs text-red-600">{productError}</p> : null}
      </div>

      <input type="hidden" name="categoryId" value={categoryId} />

      {!browse ? (
        <div id="category-suggestions" aria-live="polite">
          {suggestions.length > 0 ? (
            <>
              <p className="mb-1.5 text-xs font-medium text-neutral-600">
                Category — tap the closest match
              </p>
              <ul className="space-y-1.5">
                {suggestions.map((option) => {
                  const active = selected?.id === option.id;
                  return (
                    <li key={option.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(option);
                          pickedByHand.current = true;
                        }}
                        aria-pressed={active}
                        className={`flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                          active
                            ? "border-teal-600 bg-teal-50 text-teal-900"
                            : "border-neutral-200 bg-white hover:border-neutral-400"
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                            active ? "border-teal-600 bg-teal-600 text-white" : "border-neutral-300"
                          }`}
                          aria-hidden="true"
                        >
                          {active ? <Check className="h-3 w-3" /> : null}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-medium">{option.name}</span>
                          {option.trail ? (
                            <span className="block truncate text-xs text-neutral-500">
                              in {option.trail}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : searched && !pending ? (
            <p className="text-xs text-neutral-600">
              No category matched yet — try a simpler word (e.g. &ldquo;bulb&rdquo;,
              &ldquo;pipe&rdquo;), or browse the list below.
            </p>
          ) : query.trim().length < 2 ? (
            <p className="text-xs text-neutral-500">
              Type the product — we&apos;ll find the right category for you.
            </p>
          ) : (
            <p className="text-xs text-neutral-400">Finding categories…</p>
          )}
        </div>
      ) : (
        <div>
          <label htmlFor="categoryBrowse" className="mb-1 block text-sm font-medium">
            Category
          </label>
          <select
            id="categoryBrowse"
            value={browseValue}
            onChange={(event) => setBrowseValue(event.currentTarget.value)}
            className={inputClass(categoryError)}
          >
            <option value="">Choose a category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {categoryError ? <p className="text-xs text-red-600">{categoryError}</p> : null}

      <button
        type="button"
        onClick={() => setBrowse((on) => !on)}
        className="text-xs text-teal-700 underline underline-offset-2"
      >
        {browse ? "← Find the category from what I typed" : "Not sure? Browse all categories"}
      </button>
    </div>
  );
}
