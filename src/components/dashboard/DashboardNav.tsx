"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Dashboard sidebar navigation.
 *
 * ── Why unbuilt sections are still listed ────────────────────────────────────
 * Products, Services, Gallery, Analytics and Subscription are not built yet
 * (catalogue CRUD and billing are later phases). They stay visible because
 * hiding them entirely makes the dashboard look like the finished product and
 * leaves a seller hunting for a way to add a product that does not exist.
 *
 * But they are rendered as PLAIN TEXT, not links. A link to a route that
 * returns 404 is worse than no link: it reads as a broken application rather
 * than an unfinished one. Marking them "Soon" says which it is.
 *
 * Remove the `soon` flag as each section lands — that is the only change
 * needed here.
 */

type NavItem = {
  href: string;
  label: string;
  /** Route does not exist yet; render as text, never as a link. */
  soon?: boolean;
};

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/profile", label: "Business profile" },
  { href: "/dashboard/products", label: "Products" },
  { href: "/dashboard/services", label: "Services" },
  { href: "/dashboard/gallery", label: "Gallery" },
  { href: "/dashboard/enquiries", label: "Enquiries" },
  { href: "/dashboard/leads", label: "Leads" },
  { href: "/dashboard/orders", label: "Orders" },
  { href: "/dashboard/demand", label: "Demand alerts" },
  { href: "/dashboard/credits", label: "Credits" },
  { href: "/dashboard/website", label: "Website" },
  { href: "/dashboard/billing", label: "Plan & billing" },
  { href: "/dashboard/settings/payments", label: "Payments" },
  { href: "/dashboard/settings/shipping", label: "Shipping" },
  { href: "/dashboard/analytics", label: "Analytics", soon: true },
  { href: "/dashboard/settings", label: "Settings" },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 text-sm">
      {NAV.map((item) => {
        if (item.soon) {
          return (
            <span
              key={item.href}
              className="flex items-center justify-between rounded px-2 py-1.5 text-neutral-400"
            >
              {item.label}
              <span className="rounded-full bg-neutral-200 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-neutral-600 uppercase">
                Soon
              </span>
            </span>
          );
        }

        // Exact match for the overview, prefix match for the rest — otherwise
        // "/dashboard" would highlight on every page beneath it.
        const active =
          item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded px-2 py-1.5 ${
              active ? "bg-neutral-900 font-medium text-white" : "hover:bg-neutral-200"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
