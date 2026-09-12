import Link from "next/link";

/**
 * Small shared pieces used across every template.
 *
 * Kept together rather than one file each: these are a few lines apiece, and
 * splitting them would add more import noise than it removes.
 */

/** Page heading with an optional standfirst. */
export function PageHeader({
  title,
  description,
  eyebrow,
}: {
  title: string;
  description?: string | null;
  eyebrow?: string | null;
}) {
  return (
    <header className="mb-8">
      {eyebrow ? (
        <p className="text-xs font-medium tracking-widest uppercase opacity-60">{eyebrow}</p>
      ) : null}
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance">{title}</h1>
      {description ? (
        <p className="mt-3 max-w-2xl leading-relaxed opacity-75">{description}</p>
      ) : null}
    </header>
  );
}

/**
 * Empty state.
 *
 * Written for the visitor, not the seller: a buyer who lands on an empty
 * catalogue should be pointed at a way to make contact, not told the database
 * returned zero rows.
 */
export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div
      className="rounded-lg border border-dashed p-12 text-center"
      style={{ borderColor: "var(--site-border)" }}
    >
      <p className="font-medium">{title}</p>
      {hint ? <p className="mt-1 text-sm opacity-70">{hint}</p> : null}
      {action ? (
        <Link
          href={action.href}
          className="mt-4 inline-block rounded-md px-4 py-2 text-sm font-medium"
          style={{ background: "var(--site-primary)", color: "var(--site-background)" }}
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

/**
 * Pagination.
 *
 * Pages beyond the fifth are `nofollow`: deep pagination burns crawl budget
 * that should go to product pages, and the products on page 12 are reachable
 * through category listings anyway.
 */
export function Pagination({
  page,
  pageCount,
  basePath,
}: {
  page: number;
  pageCount: number;
  basePath: string;
}) {
  if (pageCount <= 1) return null;

  const href = (n: number) => (n === 1 ? basePath : `${basePath}?page=${n}`);
  const deep = (n: number) => n > 5;

  const pages = Array.from({ length: pageCount }, (_, i) => i + 1).filter(
    (n) => n === 1 || n === pageCount || Math.abs(n - page) <= 1,
  );

  return (
    <nav className="mt-10 flex items-center justify-center gap-2" aria-label="Pagination">
      {page > 1 ? (
        <Link
          href={href(page - 1)}
          rel={deep(page - 1) ? "nofollow prev" : "prev"}
          className="rounded-md border px-3 py-1.5 text-sm"
          style={{ borderColor: "var(--site-border)" }}
        >
          Previous
        </Link>
      ) : null}

      {pages.map((n, index) => {
        const previous = pages[index - 1];
        const gap = previous !== undefined && n - previous > 1;

        return (
          <span key={n} className="flex items-center gap-2">
            {gap ? <span className="opacity-40">…</span> : null}
            <Link
              href={href(n)}
              rel={deep(n) ? "nofollow" : undefined}
              aria-current={n === page ? "page" : undefined}
              className="min-w-9 rounded-md border px-3 py-1.5 text-center text-sm tabular-nums"
              style={
                n === page
                  ? {
                      borderColor: "var(--site-primary)",
                      background: "var(--site-primary)",
                      color: "var(--site-background)",
                    }
                  : { borderColor: "var(--site-border)" }
              }
            >
              {n}
            </Link>
          </span>
        );
      })}

      {page < pageCount ? (
        <Link
          href={href(page + 1)}
          rel={deep(page + 1) ? "nofollow next" : "next"}
          className="rounded-md border px-3 py-1.5 text-sm"
          style={{ borderColor: "var(--site-border)" }}
        >
          Next
        </Link>
      ) : null}
    </nav>
  );
}

/** Breadcrumb trail. Paired with BreadcrumbList structured data by the page. */
export function Breadcrumbs({ trail }: { trail: Array<{ href: string; label: string }> }) {
  if (trail.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="mb-6 text-sm opacity-70">
      <ol className="flex flex-wrap items-center gap-1.5">
        {trail.map((crumb, index) => (
          <li key={crumb.href} className="flex items-center gap-1.5">
            {index > 0 ? <span aria-hidden="true">/</span> : null}
            {index === trail.length - 1 ? (
              <span aria-current="page">{crumb.label}</span>
            ) : (
              <Link href={crumb.href} className="hover:underline hover:opacity-100">
                {crumb.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
