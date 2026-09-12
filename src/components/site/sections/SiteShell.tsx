import type { TenantContext } from "@/lib/tenant/context";
import { SiteHeader } from "@/components/site/sections/SiteHeader";
import { SiteFooter } from "@/components/site/sections/SiteFooter";

/**
 * Page chrome shared by every template.
 *
 * Templates differ in composition and emphasis — hero treatment, grid density,
 * measure — not in whether they have a header. Factoring the chrome out means a
 * fix to navigation or footer NAP data lands in every template at once, which
 * is the whole reason one codebase can serve thousands of sites.
 *
 * `width` is the one knob: "wide" for catalogue grids, "narrow" for reading.
 */

export function SiteShell({
  context,
  children,
  width = "wide",
}: {
  context: TenantContext;
  children: React.ReactNode;
  width?: "wide" | "narrow";
}) {
  const max = width === "narrow" ? "max-w-3xl" : "max-w-5xl";

  return (
    <>
      <SiteHeader context={context} />
      <main className={`mx-auto w-full flex-1 px-4 py-10 ${max}`}>{children}</main>
      <SiteFooter context={context} />
    </>
  );
}
