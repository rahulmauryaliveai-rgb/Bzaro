import type { ReactNode } from "react";

/**
 * Shared shell for static legal pages (/privacy, /terms). Plain typography,
 * no data fetching — these pages are fully static so they never 404 or error
 * when the database is unavailable (Google's OAuth review fetches them).
 */

export const LEGAL_LAST_UPDATED = "24 September 2026";

/** Where users and Google's reviewers reach us. Must be a mailbox that
 * actually receives mail — bzaro.in itself has no MX record. */
export const LEGAL_CONTACT_EMAIL = "rahulmauryalive@gmail.com";

export function LegalPage({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <p className="text-accent-700 text-xs font-semibold tracking-wide uppercase">{eyebrow}</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">
        {title}
      </h1>
      <p className="mt-2 text-sm text-neutral-500">Last updated: {LEGAL_LAST_UPDATED}</p>
      <div className="mt-6 text-base leading-relaxed text-neutral-700">{intro}</div>
      <div className="mt-10 space-y-10">{children}</div>
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-neutral-900">{title}</h2>
      <div className="mt-3 space-y-3 text-base leading-relaxed text-neutral-700 [&_a]:text-brand-700 [&_a]:underline [&_li]:ml-5 [&_li]:list-disc">
        {children}
      </div>
    </section>
  );
}
