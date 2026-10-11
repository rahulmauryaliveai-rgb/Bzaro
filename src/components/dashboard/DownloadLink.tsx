/**
 * A link to a file a route handler generates (D49).
 *
 * ── Why this is not `next/link` ───────────────────────────────────────────
 * `Link` performs a client-side navigation: it asks the destination for React
 * payload and swaps the page. The destinations here are route handlers that
 * answer with an .xlsx and a `Content-Disposition: attachment` header, so a
 * soft navigation gets a binary body it cannot render and the download never
 * happens. A plain anchor is the correct element — the browser's own download
 * path is exactly what is wanted.
 *
 * The `no-html-link-for-pages` rule cannot tell a route handler from a page,
 * because both are segments under `app/`. Routing every download through this
 * component means the rule stops firing (it only inspects literal hrefs) AND
 * the reason is written down once, rather than five anchors each carrying
 * their own suppression comment.
 */

export function DownloadLink({
  href,
  variant = "secondary",
  children,
}: {
  href: string;
  variant?: "primary" | "secondary" | "danger";
  children: React.ReactNode;
}) {
  const classes = {
    primary: "bg-neutral-900 text-white hover:bg-neutral-700",
    secondary: "border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50",
    danger: "border border-red-300 bg-white text-red-800 hover:bg-red-50",
  }[variant];

  return (
    <a
      href={href}
      // A hint, not a guarantee: the server's Content-Disposition is what
      // actually names the file, and it does not trust the client for it.
      download
      className={`inline-block rounded-md px-4 py-2 text-sm font-medium ${classes}`}
    >
      {children}
    </a>
  );
}
