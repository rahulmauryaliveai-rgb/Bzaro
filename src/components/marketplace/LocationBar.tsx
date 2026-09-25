"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  chooseCityAction,
  chooseCoordinatesAction,
  choosePincodeAction,
  resolveLocationBarAction,
} from "@/server/actions/location";

/**
 * "Showing sellers near {city} · Change" (Phase 3).
 *
 * ── Why precise location is never requested on load ──────────────────────────
 * A browser permission prompt the visitor did not ask for is denied far more
 * often than it is granted, and a denial is permanent for that origin. So the
 * bar shows the approximate city we already inferred, and the real prompt only
 * ever follows a deliberate press of "Use my current location" — by which
 * point the visitor knows why we are asking.
 */

export type City = { id: string; name: string };

/**
 * Pages where "sellers near you" means nothing: the buyer's own account, the
 * requirement form (it has its own city field), a single seller's profile, and
 * the static pages. Everywhere else — home, search, categories, city and
 * product listings — the bar stays.
 */
const HIDDEN_PREFIXES = [
  "/account",
  "/post-requirement",
  "/seller/",
  "/privacy",
  "/terms",
  "/pricing",
];

export function LocationBar() {
  const pathname = usePathname() ?? "/";
  if (HIDDEN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix))) {
    return null;
  }
  return <LocationBarInner />;
}

function LocationBarInner() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<City | null>(null);
  const [cities, setCities] = useState<City[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    resolveLocationBarAction()
      .then((state) => {
        if (cancelled) return;
        setCurrent(state.current);
        setCities(state.cities);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Render nothing until resolved: a bar that says "everywhere" and then
  // changes to a city a moment later reads as a bug.
  if (!loaded) return null;

  return (
    <div className="border-b border-neutral-200 bg-neutral-50">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2 text-sm">
        <span aria-hidden="true">📍</span>
        <span className="text-neutral-700">
          {current ? (
            <>
              Showing sellers near <span className="font-medium">{current.name}</span>
            </>
          ) : (
            "Showing sellers everywhere"
          )}
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-h-11 text-neutral-900 underline underline-offset-2 hover:text-neutral-600"
        >
          {current ? "Change" : "Set your city"}
        </button>
      </div>

      {open ? <LocationPicker cities={cities} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function LocationPicker({ cities, onClose }: { cities: City[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  function apply(run: () => Promise<{ ok?: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await run();
      if (result.error) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  function useMyLocation() {
    setError(null);

    if (!("geolocation" in navigator)) {
      setError("Your browser can't share a location. Enter a PIN code instead.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        apply(() => chooseCoordinatesAction(position.coords.latitude, position.coords.longitude));
      },
      () => {
        setLocating(false);
        // A denial is permanent for this origin, so say what to do instead
        // rather than inviting a retry that will not prompt again.
        setError("We couldn't get your location. Enter a PIN code or pick a city below.");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose your location"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-xl bg-white p-5 sm:rounded-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <h2 className="text-base font-semibold">Choose your location</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100"
          >
            ×
          </button>
        </div>

        <button
          type="button"
          onClick={useMyLocation}
          disabled={pending || locating}
          className="min-h-11 w-full rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {locating ? "Finding you…" : "Use my current location"}
        </button>
        <p className="mt-2 text-xs text-neutral-500">
          We use this once to find sellers near you. We don&apos;t track you.
        </p>

        <form
          className="mt-5 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const pincode = new FormData(event.currentTarget).get("pincode");
            apply(() => choosePincodeAction(String(pincode ?? "")));
          }}
        >
          <div className="flex-1">
            <label htmlFor="pincode" className="mb-1 block text-sm font-medium">
              PIN code
            </label>
            <input
              id="pincode"
              name="pincode"
              inputMode="numeric"
              maxLength={6}
              placeholder="110001"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="mt-6 min-h-11 rounded-md border border-neutral-300 px-4 text-sm font-medium hover:bg-neutral-50 disabled:opacity-60"
          >
            Go
          </button>
        </form>

        {error ? (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-5">
          <h3 className="mb-2 text-sm font-medium text-neutral-700">Or pick a city</h3>
          <ul className="grid grid-cols-2 gap-1">
            {cities.map((city) => (
              <li key={city.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => apply(() => chooseCityAction(city.id))}
                  className="min-h-11 w-full rounded-md px-3 text-left text-sm hover:bg-neutral-100 disabled:opacity-60"
                >
                  {city.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
