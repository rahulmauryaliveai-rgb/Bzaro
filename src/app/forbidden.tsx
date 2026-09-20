import Link from "next/link";
import { headers } from "next/headers";
import { SuspendedNotice } from "@/components/site/SuspendedNotice";
import { getSessionUser } from "@/lib/auth/guards";
import { tenantParamFromHost } from "@/lib/tenant/resolve";
import { signOutAction } from "@/server/actions/auth";
import { BrandLogo } from "@/components/shared/BrandLogo";
import "./globals.css";

/**
 * Platform-wide 403 boundary.
 *
 * Lives at the app root rather than inside the tenant segment because the
 * microsite layout is what calls `forbidden()`, and a layout cannot render its
 * own boundary — Next.js looks for the boundary ABOVE the throwing segment. The
 * microsite layout is a root layout, so the only level above it is here.
 *
 * Two audiences, decided by the Host header:
 *   - a tenant subdomain → the suspension notice, deliberately generic, which
 *     must not confirm which business the subdomain belongs to;
 *   - the apex (a seller opening /admin, staff opening a page above their
 *     role) → who is signed in, why they cannot see this, and a way to switch
 *     account. Showing sellers "This site is unavailable" here read as an
 *     outage.
 */
export default async function Forbidden() {
  const host = (await headers()).get("host");
  if (tenantParamFromHost(host)) return <SuspendedNotice />;

  const user = await getSessionUser();

  return (
    <html lang="en" className="h-full antialiased">
      {/* No font provider above this boundary, so fall back to the system stack. */}
      <body
        className="flex min-h-full flex-col bg-neutral-50 text-neutral-900"
        style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }}
      >
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-24">
          <div className="mb-8 flex justify-center">
            <BrandLogo height={36} />
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white p-6 text-center">
            <h1 className="text-xl font-semibold tracking-tight">
              You don&apos;t have access to this page
            </h1>
            {user ? (
              <>
                <p className="mt-3 text-sm text-neutral-600">
                  You are signed in as{" "}
                  <span className="font-medium text-neutral-900">{user.email}</span> (
                  {user.role.toLowerCase().replace(/_/g, " ")}). This area is for a different kind
                  of account.
                </p>
                <div className="mt-6 flex flex-col gap-2">
                  <Link
                    href={user.role.startsWith("SELLER") ? "/dashboard" : "/"}
                    className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
                  >
                    {user.role.startsWith("SELLER") ? "Go to my dashboard" : "Go to the homepage"}
                  </Link>
                  <form action={signOutAction}>
                    <button
                      type="submit"
                      className="w-full rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
                    >
                      Sign out and use another account
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <>
                <p className="mt-3 text-sm text-neutral-600">
                  Sign in with an account that has access.
                </p>
                <Link
                  href="/login"
                  className="mt-6 inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
                >
                  Sign in
                </Link>
              </>
            )}
          </div>
        </main>
      </body>
    </html>
  );
}
