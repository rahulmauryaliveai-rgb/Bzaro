import type { TenantContext } from "@/lib/tenant/context";
import { StorefrontHeader, type HeaderVariant } from "@/components/site/storefront/Header";
import { StorefrontFooter, type FooterVariant } from "@/components/site/storefront/Footer";
import { CONTAINER } from "@/components/site/storefront/tokens";

/**
 * Page chrome for the storefront templates: header + footer variants chosen
 * by the template, inner pages in a container. The home page passes
 * `flush` so its full-width bands can run edge to edge.
 */
export function StorefrontShell({
  context,
  header,
  footer,
  width = "wide",
  flush = false,
  children,
}: {
  context: TenantContext;
  header: HeaderVariant;
  footer: FooterVariant;
  width?: "wide" | "narrow";
  flush?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <StorefrontHeader context={context} categories={context.categories} variant={header} />
      <main
        className={
          flush
            ? "flex-1"
            : `${width === "narrow" ? "mx-auto w-full max-w-3xl px-4 sm:px-6" : CONTAINER} flex-1 py-10`
        }
      >
        {children}
      </main>
      <StorefrontFooter context={context} categories={context.categories} variant={footer} />
    </>
  );
}

/**
 * Build a full SiteTemplate's inner pages from one shell configuration, so
 * each storefront template only has to write its home composition.
 */
export { CONTAINER };
