import type { UserRole } from "@/generated/prisma/enums";

/**
 * The permission matrix.
 *
 * Every authorization decision in the application resolves through this file.
 * The alternative — `if (session.user.role === "ADMIN")` scattered across two
 * hundred route handlers — cannot be audited, and the day someone adds a
 * MODERATOR role, half those checks are silently wrong.
 *
 * One file means one place to read to answer "who can delete a product?", and
 * one place to change when the answer changes.
 */

/** `resource:action`. Keep alphabetical within each group. */
export type Permission =
  // ── Own tenant ──
  | "seller:read"
  | "seller:update"
  | "seller:delete"
  | "seller:billing"
  | "seller:domain"
  | "seller:members"
  | "product:create"
  | "product:update"
  | "product:delete"
  | "service:create"
  | "service:update"
  | "service:delete"
  | "gallery:manage"
  | "enquiry:read"
  | "enquiry:respond"
  | "enquiry:export"
  | "lead:read"
  | "lead:accept"
  | "lead:manage"
  | "website:update"
  | "analytics:read"
  // ── Platform ──
  | "admin:access"
  | "admin:seller:read"
  | "admin:seller:verify"
  | "admin:seller:suspend"
  | "admin:seller:delete"
  /** Edit a seller's website settings on their behalf (template, D33). */
  | "admin:seller:website"
  | "admin:content:moderate"
  | "admin:taxonomy:manage"
  | "admin:enquiry:read"
  | "admin:lead:read"
  | "admin:lead:refund"
  | "admin:credit:adjust"
  | "admin:subscription:manage"
  /** Turn a seller's Payments / Shipping features on or off (Phase 6). */
  | "admin:seller:features"
  | "admin:plan:manage"
  | "admin:user:read"
  | "admin:user:role"
  | "admin:settings:manage"
  | "admin:audit:read";

/** Permissions granted to a seller who owns the tenant. */
const SELLER_OWNER: Permission[] = [
  "seller:read",
  "seller:update",
  "seller:delete",
  "seller:billing",
  "seller:domain",
  "seller:members",
  "product:create",
  "product:update",
  "product:delete",
  "service:create",
  "service:update",
  "service:delete",
  "gallery:manage",
  "enquiry:read",
  "enquiry:respond",
  "enquiry:export",
  "lead:read",
  "lead:accept",
  "lead:manage",
  "website:update",
  "analytics:read",
];

/**
 * Staff can run the catalogue and answer enquiries but cannot touch money,
 * the domain, team membership, or delete the business.
 */
const SELLER_STAFF: Permission[] = [
  "seller:read",
  "seller:update",
  "product:create",
  "product:update",
  "product:delete",
  "service:create",
  "service:update",
  "service:delete",
  "gallery:manage",
  "enquiry:read",
  "enquiry:respond",
  "lead:read",
  "lead:accept",
  "lead:manage",
  "website:update",
  "analytics:read",
];

/** Read-only across tenants, plus enquiry assistance. */
const SUPPORT: Permission[] = [
  "admin:access",
  "admin:seller:read",
  "admin:enquiry:read",
  "admin:lead:read",
  "admin:user:read",
];

/** Content decisions only. Explicitly no billing and no user administration. */
const MODERATOR: Permission[] = [
  "admin:access",
  "admin:seller:read",
  "admin:seller:suspend",
  "admin:content:moderate",
  "admin:enquiry:read",
  "admin:lead:read",
];

const ADMIN: Permission[] = [
  "admin:access",
  "admin:seller:read",
  "admin:seller:verify",
  "admin:seller:suspend",
  "admin:seller:website",
  "admin:content:moderate",
  "admin:taxonomy:manage",
  "admin:enquiry:read",
  "admin:lead:read",
  "admin:lead:refund",
  "admin:credit:adjust",
  "admin:subscription:manage",
  "admin:seller:features",
  "admin:plan:manage",
  "admin:user:read",
  "admin:audit:read",
];

/**
 * SUPER_ADMIN adds the three capabilities deliberately withheld from ADMIN:
 * granting roles (privilege escalation), deleting sellers (irreversible), and
 * changing platform settings (blast radius is every tenant).
 */
const SUPER_ADMIN: Permission[] = [
  ...ADMIN,
  "admin:user:role",
  "admin:seller:delete",
  "admin:settings:manage",
];

const MATRIX: Record<UserRole, Permission[]> = {
  BUYER: [],
  SELLER_OWNER,
  SELLER_STAFF,
  SUPPORT,
  MODERATOR,
  ADMIN,
  SUPER_ADMIN,
};

const MATRIX_SETS = Object.fromEntries(
  Object.entries(MATRIX).map(([role, perms]) => [role, new Set(perms)]),
) as unknown as Record<UserRole, ReadonlySet<Permission>>;

/**
 * Does `role` hold `permission`?
 *
 * Tenant-scoped permissions answer only "may this ROLE do this at all" —
 * whether the caller owns the specific tenant is a separate question answered
 * by `requireSellerAccess()` in guards.ts. Both checks are always required.
 */
export function can(role: UserRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return MATRIX_SETS[role]?.has(permission) ?? false;
}

/** True when the role may open the admin area at all. */
export function isPlatformStaff(role: UserRole | null | undefined): boolean {
  return can(role, "admin:access");
}

/** True for roles that operate inside a seller tenant. */
export function isSellerRole(role: UserRole | null | undefined): boolean {
  return role === "SELLER_OWNER" || role === "SELLER_STAFF";
}

/** Full permission list for a role. Used to render the admin roles screen. */
export function permissionsFor(role: UserRole): readonly Permission[] {
  return MATRIX[role] ?? [];
}
