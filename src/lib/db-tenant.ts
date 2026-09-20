import "server-only";
import { db, Prisma } from "@/lib/db";

/**
 * Tenant-scoped database client.
 *
 * This is the second of three isolation layers (see docs/SECURITY.md):
 *
 *   1. Guards      — `requireSellerAccess()` proves the caller owns the tenant.
 *   2. This module — every query is mechanically scoped to that tenant.
 *   3. RLS         — optional Postgres row-level security, Phase 10.
 *
 * The point of layer 2 is that it removes the possibility of a mistake rather
 * than relying on reviewers to catch one. Dashboard code receives a client that
 * *cannot express* a cross-tenant query: the `where` clause is injected on
 * every read, and every write is verified to belong to the scoped tenant.
 *
 * Usage:
 *
 *   const scope = await requireSellerAccess(sellerId);
 *   const tdb   = forSeller(scope.sellerId);
 *   const items = await tdb.product.findMany();   // implicitly scoped
 *
 * NEVER import `db` directly in dashboard code paths. The ESLint rule in
 * eslint.config.mjs enforces this for `src/app/(dashboard)/**`.
 */

/**
 * Models owning a direct `sellerId` column. Adding a tenant-owned model to the
 * schema without adding it here is a silent isolation hole, so the seed's
 * integrity test asserts this list matches the schema.
 */
export const TENANT_MODELS = [
  "product",
  "productImage",
  "service",
  "galleryItem",
  "enquiry",
  "review",
  "sellerCategory",
  "sellerDocument",
  "sellerSlugHistory",
  "subscription",
  "payment",
  "analyticsEvent",
  "analyticsDaily",
  "lead",
  "creditLedger",
  "leadFlag",
  "sellerServiceArea",
] as const;

export type TenantModel = (typeof TENANT_MODELS)[number];

const TENANT_MODEL_SET = new Set<string>(TENANT_MODELS);

/** Operations whose arguments carry a filterable `where`. */
const READ_OPS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "deleteMany",
]);

/** Operations that write a payload we must stamp and verify. */
const WRITE_OPS = new Set(["create", "createMany", "update", "upsert", "delete"]);

export class TenantIsolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantIsolationError";
  }
}

/**
 * Loosely-typed view of a Prisma model delegate.
 *
 * Two operations — `findUnique` and `delete` — have to be rerouted to their
 * filterable equivalents (`findFirst`, `deleteMany`) because Prisma rejects a
 * non-unique field like `sellerId` in a unique where clause. Reaching a
 * delegate by string name means TypeScript resolves the union of every model's
 * delegate, so the call is typed here instead. Callers still get full type
 * safety: the extension returns a normally-typed client.
 */
type LooseDelegate = Record<string, (args: unknown) => Promise<unknown>>;

function delegateFor(modelKey: string): LooseDelegate {
  return (db as unknown as Record<string, LooseDelegate>)[modelKey]!;
}

/**
 * Returns a Prisma client whose every operation on a tenant-owned model is
 * constrained to `sellerId`.
 *
 * Reads: `where` gains `sellerId`, overwriting any caller-supplied value so a
 * crafted request cannot widen the scope.
 *
 * Writes: `data` is stamped with `sellerId`. If the caller supplied a different
 * `sellerId`, the operation throws rather than silently rewriting it — a
 * mismatch means a bug or an attack, and neither should be papered over.
 *
 * `findUnique` is rewritten to `findFirst`, because a unique lookup by primary
 * key would otherwise bypass the scope filter entirely: Prisma rejects
 * non-unique fields in a `findUnique` where clause.
 */
export function forSeller(sellerId: string) {
  if (!sellerId) {
    throw new TenantIsolationError("forSeller() called without a sellerId");
  }

  return db.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const modelKey = model ? lowerFirst(model) : "";

          // Platform-wide models (User, Category, Location, Plan, …) are not
          // tenant-owned and pass through untouched.
          if (!TENANT_MODEL_SET.has(modelKey)) {
            return query(args);
          }

          const a = args as Record<string, unknown>;

          // `query` is typed against the union of every model's argument shape,
          // so building args dynamically fights the type system for no benefit.
          // The runtime contract is enforced above by TENANT_MODEL_SET and
          // below by assertTenant().
          const run = query as unknown as (next: unknown) => Promise<unknown>;

          // ── Reads and bulk mutations ────────────────────────────────────────
          if (READ_OPS.has(operation)) {
            // A findUnique whose where clause is a primary key cannot also
            // carry sellerId, so downgrade it to findFirst and filter there.
            if (operation === "findUnique" || operation === "findUniqueOrThrow") {
              const next = {
                ...a,
                where: { ...(a.where as object), sellerId },
              };
              const fallback = operation === "findUnique" ? "findFirst" : "findFirstOrThrow";
              return delegateFor(modelKey)[fallback]!(next);
            }

            return run({
              ...a,
              where: { ...(a.where as object | undefined), sellerId },
            });
          }

          // ── Writes ──────────────────────────────────────────────────────────
          if (WRITE_OPS.has(operation)) {
            if (operation === "delete") {
              // A scoped delete has the same primary-key problem as findUnique.
              // deleteMany accepts arbitrary filters, so route through it.
              return delegateFor(modelKey).deleteMany!({
                where: { ...(a.where as object), sellerId },
              });
            }

            if (operation === "update") {
              return run({
                ...a,
                where: { ...(a.where as object), sellerId },
                data: assertTenant(a.data, sellerId),
              });
            }

            if (operation === "createMany") {
              const rows = Array.isArray(a.data) ? a.data : [a.data];
              return run({
                ...a,
                data: rows.map((row) => assertTenant(row, sellerId)),
              });
            }

            if (operation === "upsert") {
              return run({
                ...a,
                where: { ...(a.where as object), sellerId },
                create: assertTenant(a.create, sellerId),
                update: assertTenant(a.update, sellerId),
              });
            }

            // create
            return run({ ...a, data: assertTenant(a.data, sellerId) });
          }

          return run(args);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof forSeller>;

/**
 * Stamp `sellerId` onto a write payload, rejecting a payload that names a
 * different tenant. Silently overwriting would hide the bug; throwing surfaces
 * it in development and blocks it in production.
 */
function assertTenant(data: unknown, sellerId: string): Record<string, unknown> {
  if (data === null || typeof data !== "object") {
    return { sellerId };
  }

  const payload = data as Record<string, unknown>;
  const supplied = payload.sellerId;

  if (typeof supplied === "string" && supplied !== sellerId) {
    throw new TenantIsolationError(
      `Refusing to write a row for seller ${supplied} from a scope bound to ${sellerId}.`,
    );
  }

  return { ...payload, sellerId };
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

export { Prisma };
