import Link from "next/link";

/**
 * The four steps of bulk upload (D49).
 *
 * ── Why a step indicator at all ────────────────────────────────────────────
 * Bulk upload is four screens that each look finished on their own. A seller
 * who uploads a spreadsheet and sees "40 products imported" reasonably
 * believes they are done — and their catalogue then sits as forty drafts with
 * no photographs, invisible to everyone, until they wonder why no enquiries
 * came. Showing the whole path, with where they are on it, is what prevents
 * that.
 *
 * ── Mobile first ──────────────────────────────────────────────────────────
 * On a phone the four labels do not fit side by side, so the numbers stay in a
 * row and only the current step keeps its label. Nothing is hidden that the
 * seller needs: the step they are on is the one they need named.
 */

const STEPS = [
  { number: 1, label: "Upload Excel", href: "/dashboard/products/import" },
  { number: 2, label: "Check", href: null },
  { number: 3, label: "Add photos", href: "/dashboard/products/import/photos" },
  { number: 4, label: "Publish", href: "/dashboard/products" },
] as const;

export function ImportSteps({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <nav aria-label="Bulk upload steps" className="mb-6">
      <ol className="flex items-center gap-1 sm:gap-2">
        {STEPS.map((step, index) => {
          const done = step.number < current;
          const active = step.number === current;

          const circle = (
            <span
              aria-hidden="true"
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                active
                  ? "bg-neutral-900 text-white"
                  : done
                    ? "bg-teal-600 text-white"
                    : "bg-neutral-200 text-neutral-600"
              }`}
            >
              {done ? "✓" : step.number}
            </span>
          );

          const label = (
            <span
              className={`text-xs sm:text-sm ${
                active ? "font-medium text-neutral-900" : "text-neutral-500"
              } ${active ? "" : "hidden sm:inline"}`}
            >
              {step.label}
            </span>
          );

          // A completed step links back — a seller who wants to re-check the
          // preview or add more photos should not have to find the page again.
          const content =
            done && step.href ? (
              <Link href={step.href} className="flex items-center gap-2 hover:underline">
                {circle}
                {label}
              </Link>
            ) : (
              <span className="flex items-center gap-2">
                {circle}
                {label}
              </span>
            );

          return (
            <li key={step.number} className="flex min-w-0 items-center gap-1 sm:gap-2">
              {content}
              {index < STEPS.length - 1 ? (
                <span aria-hidden="true" className="h-px w-3 bg-neutral-300 sm:w-6" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
