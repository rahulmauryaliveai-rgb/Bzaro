import { handlers } from "@/lib/auth/config";

/**
 * Auth.js route handlers.
 *
 * Excluded from the proxy matcher (see src/proxy.ts) so auth endpoints are
 * never rewritten into a tenant path space. Auth is an apex-only concern —
 * a tenant subdomain has no business serving a sign-in callback.
 */

export const { GET, POST } = handlers;
