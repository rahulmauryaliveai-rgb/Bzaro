import { SuspendedNotice } from "@/components/site/SuspendedNotice";

/**
 * Platform-wide 403 boundary.
 *
 * Lives at the app root rather than inside the tenant segment because the
 * microsite layout is what calls `forbidden()`, and a layout cannot render its
 * own boundary — Next.js looks for the boundary ABOVE the throwing segment. The
 * microsite layout is a root layout, so the only level above it is here.
 *
 * It therefore renders a complete document, and stays deliberately generic: it
 * serves suspended tenants today and any future `forbidden()` call, and it must
 * not confirm which business a suspended subdomain belongs to.
 */
export default function Forbidden() {
  return <SuspendedNotice />;
}
