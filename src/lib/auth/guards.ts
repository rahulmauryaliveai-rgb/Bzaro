import "server-only";
import { cache } from "react";
import { redirect, forbidden, unauthorized } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { can, isPlatformStaff, type Permission } from "@/lib/auth/permissions";
import type { UserRole } from "@/generated/prisma/enums";

/**
 * Authorization guards.
 *
 * ── The rule this file exists to enforce ─────────────────────────────────────
 * EVERY Server Action authorises itself from scratch. It never assumes a parent
 * layout already checked.
 *
 * A Server Action is a POST endpoint. Anyone can invoke it directly with a
 * crafted request — the layout that "protects" it in the UI never runs. Layout
 * guards are for user experience (send the logged-out user to /login); action
 * guards are the actual security boundary.
 *
 * Guards throw via Next.js navigation helpers rather than returning a result,
 * so a caller who forgets to check the return value fails closed instead of
 * open.
 */

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
};

/**
 * Current session user, or null.
 *
 * Memoised per request: a dashboard page may check permissions in a layout, a
 * page and three components, and this collapses that to one resolution.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;

  return {
    id: session.user.id,
    email: session.user.email ?? "",
    name: session.user.name ?? null,
    role: (session.user.role as UserRole) ?? "BUYER",
  };
});

/** Require any authenticated user. Redirects to login for page rendering. */
export async function requireUser(returnTo?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    const target = returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : "/login";
    redirect(target);
  }
  return user;
}

/**
 * Require an authenticated user in a Server Action or route handler.
 *
 * Unlike `requireUser`, this raises a 401 rather than redirecting: a redirect
 * response to a programmatic POST is confusing to clients and can be mistaken
 * for success.
 */
export async function requireUserStrict(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) unauthorized();
  return user;
}

/** Require a specific platform permission. */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUserStrict();
  if (!can(user.role, permission)) forbidden();
  return user;
}

/** Require access to the admin area at all. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin");
  if (!isPlatformStaff(user.role)) forbidden();
  return user;
}

/**
 * A proven, tenant-scoped capability.
 *
 * Carrying this object — rather than a bare `sellerId` string — makes the
 * difference visible at every call site: a function taking a `TenantScope`
 * cannot be handed an ID that arrived unchecked from a request body.
 */
export type TenantScope = {
  sellerId: string;
  sellerSlug: string;
  userId: string;
  role: UserRole;
};

/**
 * Prove the current user may act on `sellerId`.
 *
 * Membership is read from the database on every call rather than trusted from
 * the token: a seller removed from a business must lose access immediately, and
 * a token minted before their removal would still claim membership.
 */
export async function requireSellerAccess(sellerId: string): Promise<TenantScope> {
  const user = await requireUserStrict();

  const membership = await db.sellerMember.findUnique({
    where: { userId_sellerId: { userId: user.id, sellerId } },
    select: {
      role: true,
      seller: { select: { id: true, slug: true, status: true, deletedAt: true } },
    },
  });

  if (!membership || membership.seller.deletedAt) forbidden();

  // A banned seller cannot use the dashboard at all. Suspended sellers keep
  // read access so they can see why and fix it — a suspension the seller cannot
  // even log in to understand generates a support ticket every time.
  if (membership.seller.status === "BANNED") forbidden();

  return {
    sellerId: membership.seller.id,
    sellerSlug: membership.seller.slug,
    userId: user.id,
    role: membership.role,
  };
}

/** Require a tenant capability as well as membership. */
export async function requireSellerPermission(
  sellerId: string,
  permission: Permission,
): Promise<TenantScope> {
  const scope = await requireSellerAccess(sellerId);
  if (!can(scope.role, permission)) forbidden();
  return scope;
}

/**
 * The current user's active seller, for dashboard routes that do not carry a
 * seller ID in the URL.
 *
 * Multi-tenant membership is supported by the schema from day one, so this
 * resolves the first membership today and becomes a real tenant switcher later
 * without changing any caller.
 */
export const getActiveSeller = cache(async (): Promise<TenantScope | null> => {
  const user = await getSessionUser();
  if (!user) return null;

  const membership = await db.sellerMember.findFirst({
    where: { userId: user.id, seller: { deletedAt: null } },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      seller: { select: { id: true, slug: true, status: true } },
    },
  });

  if (!membership) return null;

  return {
    sellerId: membership.seller.id,
    sellerSlug: membership.seller.slug,
    userId: user.id,
    role: membership.role,
  };
});

/** Require that the current user owns a seller; send them to onboarding if not. */
export async function requireSeller(): Promise<TenantScope> {
  await requireUser("/dashboard");
  const scope = await getActiveSeller();
  if (!scope) redirect("/register/business");
  return scope;
}
