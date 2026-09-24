import Link from "next/link";

/**
 * "Tell us your requirement" on search results (Phase 4).
 *
 * The case for it is the searches that go badly: a buyer who scrolled a page of
 * near-misses has told us exactly what they want and found nobody selling it.
 * Rather than let them leave, this turns the dead end into a requirement that
 * goes to matched suppliers.
 *
 * Deliberately a link to /post-requirement rather than an inline modal: this
 * renders inside a cached, crawlable results page, and mounting the whole
 * contact flow here would pull client state onto every search.
 */
export function RequirementCard({ query }: { query?: string }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-neutral-50 p-5">
      <h2 className="text-base font-semibold">Not finding the right supplier?</h2>
      <p className="mt-1 text-sm text-neutral-600">
        {query
          ? `Tell us what you need${query ? ` for “${query}”` : ""} and up to 10 verified suppliers in your city will come back to you with prices.`
          : "Tell us what you need and up to 10 verified suppliers in your city will come back to you with prices."}
      </p>
      <Link
        href={query ? `/post-requirement?q=${encodeURIComponent(query)}` : "/post-requirement"}
        className="mt-4 inline-flex min-h-11 items-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800"
      >
        Tell us your requirement
      </Link>
    </section>
  );
}
