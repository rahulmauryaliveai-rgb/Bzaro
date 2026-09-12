import Link from "next/link";
import { buildSearchQuery, MAX_PAGE, type SearchParams } from "@/lib/validation/search";

/**
 * Pagination for marketplace result sets.
 *
 * Pages past the fifth carry `rel="nofollow"`. Deep pagination is crawl-budget
 * waste — the items on page 40 are reachable through category pages, and
 * letting a crawler walk a filtered result set to page 50 costs real money on a
 * per-invocation platform while indexing nothing useful.
 *
 * The page list is windowed (first, last, and a neighbourhood of the current
 * page) so a 50-page result does not render 50 links on a phone.
 */

export function ResultsPagination({
  params,
  pageCount,
  basePath = "/search",
}: {
  params: SearchParams;
  pageCount: number;
  basePath?: string;
}) {
  const capped = Math.min(pageCount, MAX_PAGE);
  if (capped <= 1) return null;

  const page = params.page;
  const href = (n: number) => `${basePath}${buildSearchQuery(params, { page: n })}`;
  const deep = (n: number) => n > 5;

  const visible = Array.from({ length: capped }, (_, i) => i + 1).filter(
    (n) => n === 1 || n === capped || Math.abs(n - page) <= 1,
  );

  return (
    <nav className="mt-10 flex flex-wrap items-center justify-center gap-2" aria-label="Pagination">
      {page > 1 ? (
        <Link
          href={href(page - 1)}
          rel={deep(page - 1) ? "nofollow prev" : "prev"}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
        >
          Previous
        </Link>
      ) : null}

      {visible.map((n, index) => {
        const previous = visible[index - 1];
        const gap = previous !== undefined && n - previous > 1;

        return (
          <span key={n} className="flex items-center gap-2">
            {gap ? (
              <span className="text-neutral-400" aria-hidden="true">
                …
              </span>
            ) : null}
            <Link
              href={href(n)}
              rel={deep(n) ? "nofollow" : undefined}
              aria-current={n === page ? "page" : undefined}
              className={`min-w-9 rounded-md border px-3 py-1.5 text-center text-sm tabular-nums ${
                n === page
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-300 hover:bg-neutral-50"
              }`}
            >
              {n}
            </Link>
          </span>
        );
      })}

      {page < capped ? (
        <Link
          href={href(page + 1)}
          rel={deep(page + 1) ? "nofollow next" : "next"}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
        >
          Next
        </Link>
      ) : null}
    </nav>
  );
}

/** Breadcrumb trail for category and location pages. */
export function MarketplaceBreadcrumbs({
  trail,
}: {
  trail: Array<{ href: string; label: string }>;
}) {
  if (trail.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="mb-5 text-sm text-neutral-500">
      <ol className="flex flex-wrap items-center gap-1.5">
        {trail.map((crumb, index) => (
          <li key={crumb.href} className="flex items-center gap-1.5">
            {index > 0 ? <span aria-hidden="true">/</span> : null}
            {index === trail.length - 1 ? (
              <span aria-current="page" className="text-neutral-700">
                {crumb.label}
              </span>
            ) : (
              <Link href={crumb.href} className="hover:text-neutral-900 hover:underline">
                {crumb.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
