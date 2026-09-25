import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/server/actions/auth";
import { getBuyerAccountSummary } from "@/server/services/buyer-account.service";

/**
 * The buyer account frame: sidebar on desktop, a scrolling tab row on phones.
 * Server component — the counts come straight from the database on each
 * request (these pages are private and never cached).
 */

export type AccountSection = "overview" | "requirements" | "saved" | "orders" | "profile";

export function initialsOf(name: string | null, email: string): string {
  const source = (name ?? "").trim() || email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "B";
}

export async function AccountShell({
  userId,
  active,
  children,
}: {
  userId: string;
  active: AccountSection;
  children: ReactNode;
}) {
  const summary = await getBuyerAccountSummary(userId);
  const counts = summary?.counts;

  const links: Array<{ key: AccountSection; href: string; label: string; count?: number }> = [
    { key: "overview", href: "/account", label: "Overview" },
    {
      key: "requirements",
      href: "/account/requirements",
      label: "My requirements",
      count: counts?.requirements,
    },
    { key: "saved", href: "/account/saved", label: "Saved suppliers", count: counts?.saved },
    { key: "orders", href: "/account/orders", label: "My orders", count: counts?.orders },
    { key: "profile", href: "/account/profile", label: "Profile & settings" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:py-10">
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm md:grid md:min-h-[32rem] md:grid-cols-[15rem_1fr]">
        <aside className="border-b border-neutral-200 bg-neutral-50/60 md:border-r md:border-b-0">
          {summary ? (
            <div className="hidden items-center gap-3 px-5 pt-6 pb-4 md:flex">
              <span className="bg-brand-700 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white">
                {initialsOf(summary.name, summary.email)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-neutral-900">
                  {summary.name ?? "Your account"}
                </p>
                <p className="truncate text-xs text-neutral-500">
                  Buyer{summary.city ? ` · ${summary.city}` : ""}
                </p>
              </div>
            </div>
          ) : null}

          <nav
            aria-label="Account"
            className="flex [scrollbar-width:none] gap-1 overflow-x-auto p-2 md:flex-col md:px-3 md:pb-6"
          >
            {links.map((link) => {
              const isActive = link.key === active;
              return (
                <Link
                  key={link.key}
                  href={link.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex min-h-10 shrink-0 items-center justify-between gap-3 rounded-lg px-3 text-sm whitespace-nowrap transition-colors ${
                    isActive
                      ? "bg-brand-50 text-brand-800 font-semibold"
                      : "text-neutral-700 hover:bg-neutral-100"
                  }`}
                >
                  {link.label}
                  {link.count !== undefined ? (
                    <span className="text-xs font-normal text-neutral-500">{link.count}</span>
                  ) : null}
                </Link>
              );
            })}
            <form
              action={signOutAction}
              className="md:mt-4 md:border-t md:border-neutral-200 md:pt-3"
            >
              <button
                type="submit"
                className="flex min-h-10 w-full shrink-0 items-center rounded-lg px-3 text-sm whitespace-nowrap text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
              >
                Sign out
              </button>
            </form>
          </nav>
        </aside>

        <main className="min-w-0 p-5 md:p-8">{children}</main>
      </div>
    </div>
  );
}
