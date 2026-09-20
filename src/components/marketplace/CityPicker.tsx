"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The buyer's city picker.
 *
 * Client-side on purpose: the homepage and city pages are ISR, so nothing
 * server-rendered may depend on a cookie. The choice lives in a plain,
 * non-HttpOnly `bz_city` cookie (a preference, not an identity), which the
 * picker reads on mount to preselect, and which the contact modal's city
 * select could later default from.
 *
 * Choosing a city navigates to that city's landing page — the page IS the
 * personalised view, cached once per city rather than once per visitor.
 */

export const CITY_COOKIE = "bz_city";

export type CityChoice = { slug: string; name: string };

export function readCityCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${CITY_COOKIE}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function writeCityCookie(slug: string): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CITY_COOKIE}=${encodeURIComponent(slug)}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax${secure}`;
}

export function CityPicker({
  cities,
  current,
  className,
}: {
  cities: CityChoice[];
  /** Slug of the city this page is already showing, if any. */
  current?: string | null;
  className?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(current ?? "");

  // On a page that is not city-specific, preselect the remembered city.
  useEffect(() => {
    if (current) return;
    const remembered = readCityCookie();
    if (remembered && cities.some((city) => city.slug === remembered)) {
      // Deferred so the server-rendered markup and the first client render
      // agree; the cookie only exists in the browser.
      const id = window.setTimeout(() => setValue(remembered), 0);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [current, cities]);

  return (
    <label className={className ?? "inline-flex items-center gap-2 text-sm"}>
      <span className="text-neutral-600">City</span>
      <select
        value={value}
        onChange={(event) => {
          const slug = event.currentTarget.value;
          setValue(slug);
          if (!slug) return;
          writeCityCookie(slug);
          router.push(`/${slug}`);
        }}
        className="rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm"
        aria-label="Choose your city"
      >
        <option value="">All India</option>
        {cities.map((city) => (
          <option key={city.slug} value={city.slug}>
            {city.name}
          </option>
        ))}
      </select>
    </label>
  );
}
