import Link from "next/link";
import type { EligibilityResult } from "@/lib/validation/index-eligibility";

/**
 * Index-eligibility checklist (decision D2).
 *
 * This component is the reason the gate is defensible. A seller whose site is
 * `noindex` with no explanation concludes the platform is broken and contacts
 * support; a seller who can see exactly what is missing fixes it themselves.
 *
 * `evaluateEligibility` returns EVERY unmet requirement rather than
 * short-circuiting on the first, precisely so this can render a complete list.
 * Revealing one item at a time would be a miserable way to complete a profile.
 *
 * Each failure maps to the page that fixes it — a checklist that tells you what
 * is wrong but not where to go is only half a checklist.
 */

/**
 * Where each unmet requirement gets fixed.
 *
 * `pending` marks a fix whose destination is not built yet (catalogue CRUD).
 * Those render as plain text rather than links: sending a seller to a 404 to
 * fix a problem is worse than telling them the tool is not ready, and it is
 * not their failing to fix — the platform owes them the screen first.
 */
const FIX_LINKS: Record<string, { href: string; label: string; pending?: boolean }> = {
  not_verified: { href: "/dashboard/settings", label: "Verification status" },
  phone_unverified: { href: "/dashboard/settings", label: "Verify phone" },
  not_published: { href: "/dashboard/website", label: "Publish website" },
  business_name: { href: "/dashboard/profile", label: "Edit profile" },
  description: { href: "/dashboard/profile", label: "Write a description" },
  image: { href: "/dashboard/profile", label: "Add a logo" },
  location: { href: "/dashboard/profile", label: "Set your city" },
  contact: { href: "/dashboard/profile", label: "Add contact details" },
  address: { href: "/dashboard/profile", label: "Add your address" },
  catalogue: { href: "/dashboard/products", label: "Add products" },
  moderation: { href: "/dashboard/products", label: "Review content" },
  inactive: { href: "/dashboard/settings", label: "Account status" },
};

export function EligibilityChecklist({ result }: { result: EligibilityResult }) {
  if (result.eligible) {
    return (
      <section className="rounded-lg border border-teal-600 bg-teal-50 p-5">
        <h2 className="font-medium text-teal-900">Your website is visible to search engines</h2>
        <p className="mt-1 text-sm text-teal-800">
          Your profile is complete. Search engines can now index your site — it usually takes
          a few weeks for pages to start appearing.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium text-amber-900">
          Your website is live, but hidden from search engines
        </h2>
        <span className="text-sm font-medium text-amber-900 tabular-nums">
          {result.score}% complete
        </span>
      </div>

      <div
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-amber-200"
        role="progressbar"
        aria-valuenow={result.score}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Profile completeness"
      >
        <div className="h-full rounded-full bg-amber-600" style={{ width: `${result.score}%` }} />
      </div>

      <p className="mt-3 text-sm text-amber-900">
        Buyers can already find you on the marketplace. Complete these to let Google index
        your own website too:
      </p>

      <ul className="mt-4 space-y-2">
        {result.failures.map((failure) => {
          const fix = FIX_LINKS[failure.code];

          return (
            <li key={failure.code} className="flex items-start gap-3 text-sm">
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-amber-500 text-[10px] text-amber-700"
              >
                ○
              </span>

              <span className="min-w-0 flex-1 text-amber-900">{failure.message}</span>

              {fix?.pending ? (
                <span className="shrink-0 text-xs font-medium text-amber-700">
                  Coming soon
                </span>
              ) : fix ? (
                <Link
                  href={fix.href}
                  className="shrink-0 text-xs font-medium text-amber-900 underline underline-offset-2"
                >
                  {fix.label}
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/*
        Explaining the "why" matters. Without it this reads as an arbitrary
        hurdle, and the seller's reasonable conclusion is that the platform is
        holding their site hostage.
      */}
      <details className="mt-4 text-sm text-amber-900">
        <summary className="cursor-pointer font-medium">Why does this exist?</summary>
        <p className="mt-2 leading-relaxed">
          Every seller here gets a website on a shared domain. If search engines find
          thousands of near-empty sites on it, they penalise the whole domain — including
          the sellers who did fill theirs in. Holding incomplete sites back until they have
          real content protects everyone&rsquo;s ranking, including yours.
        </p>
      </details>
    </section>
  );
}
