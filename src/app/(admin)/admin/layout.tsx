import type { Metadata } from "next";
import { BrandLogo } from "@/components/shared/BrandLogo";
import { SignOutButton } from "@/components/shared/SignOutButton";
import Link from "next/link";
import { IBM_Plex_Sans } from "next/font/google";
import { requireAdmin } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import "../../globals.css";

/**
 * Admin shell.
 *
 * Navigation is filtered by permission rather than by role name, so a MODERATOR
 * simply does not see billing links. Hiding a link is presentation only — every
 * admin page and action re-checks its own permission server-side.
 */

const sans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

const NAV = [
  { href: "/admin", label: "Dashboard", permission: "admin:access" },
  { href: "/admin/sellers", label: "Sellers", permission: "admin:seller:read" },
  { href: "/admin/sellers/pending", label: "Pending sellers", permission: "admin:seller:verify" },
  { href: "/admin/moderation", label: "Moderation", permission: "admin:content:moderate" },
  { href: "/admin/categories", label: "Categories", permission: "admin:taxonomy:manage" },
  { href: "/admin/locations", label: "Locations", permission: "admin:taxonomy:manage" },
  { href: "/admin/enquiries", label: "Enquiries", permission: "admin:enquiry:read" },
  { href: "/admin/leads", label: "Leads", permission: "admin:lead:read" },
  { href: "/admin/leads/flags", label: "Lead flags", permission: "admin:lead:refund" },
  { href: "/admin/subscriptions", label: "Subscriptions", permission: "admin:subscription:manage" },
  { href: "/admin/plans", label: "Plans", permission: "admin:plan:manage" },
  { href: "/admin/audit-log", label: "Audit log", permission: "admin:audit:read" },
  { href: "/admin/settings", label: "Settings", permission: "admin:settings:manage" },
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  const visible = NAV.filter((item) => can(user.role, item.permission));

  return (
    <html lang="en" className={`${sans.variable} h-full antialiased`}>
      <body className="min-h-full bg-neutral-900 text-neutral-100">
        <div className="mx-auto flex max-w-7xl gap-8 px-4 py-8">
          <aside className="w-56 shrink-0">
            <div className="mb-6">
              <BrandLogo height={30} />
            </div>
            <p className="text-xs tracking-wide text-neutral-500 uppercase">Admin</p>
            <p className="truncate text-sm font-medium">{user.role}</p>
            <p className="mb-4 truncate text-xs text-neutral-500">{user.email}</p>
            <div className="mb-6 border-b border-neutral-800 pb-4">
              <SignOutButton tone="dark" />
            </div>
            <nav className="flex flex-col gap-1 text-sm">
              {visible.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded px-2 py-1.5 text-neutral-300 hover:bg-neutral-800 hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </aside>

          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
