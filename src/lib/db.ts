import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/env";
import { RETRYABLE_OPERATIONS, withConnectionRetry } from "@/lib/db-retry";

/**
 * Prisma client singleton.
 *
 * ── Connection pooling ───────────────────────────────────────────────────────
 * Prisma 7 connects through a driver adapter, which means we own the `pg` pool
 * directly. That matters here: serverless functions open connections
 * aggressively, and an unbounded pool will exhaust the Postgres connection
 * limit during the first real traffic spike.
 *
 * In production the app talks to PgBouncer in transaction mode, so each
 * instance needs only a small pool — the pooler does the real multiplexing.
 * Prepared statements are disabled because PgBouncer in transaction mode cannot
 * guarantee the same backend connection across statements.
 *
 * `prisma migrate` does NOT use this client; it connects directly via
 * DIRECT_DATABASE_URL (see prisma7.config.ts), because migrations need
 * session-level state such as advisory locks that a transaction-mode pooler
 * will not preserve.
 *
 * ── The singleton ────────────────────────────────────────────────────────────
 * Next.js dev-mode hot reloading re-evaluates modules on every change. Without
 * stashing the client on `globalThis`, each reload would leak a new pool and
 * exhaust connections within a few minutes of editing.
 */

const isProduction = env.NODE_ENV === "production";

function createPrismaClient() {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    // Small per-instance pool: PgBouncer multiplexes, so a large pool here
    // buys nothing and risks exhausting the upstream limit.
    //
    // The same size in development, deliberately. When the database restarts
    // under a running server every pooled socket is dead, and `pg` discards one
    // per failed query — so a larger pool means more failures to chew through
    // before a request can succeed. Matching production also means the retry
    // budget in db-retry.ts is tuned against one number rather than two.
    max: 5,

    // Anything between us and Postgres — PgBouncer, a cloud proxy, or the local
    // `prisma dev` server — will drop idle connections on its own schedule. If
    // our idle timeout is longer than theirs, the pool hands out a socket the
    // far end has already closed and the query dies with "Connection terminated
    // unexpectedly". Closing first, and keeping the survivors warm, avoids it.
    idleTimeoutMillis: 10_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 5_000,

    // Fail fast rather than queueing requests behind an unhealthy database.
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: !isProduction,
  });

  // A pooled client can emit `error` while idle — the far end hung up. Without
  // a listener this is an unhandled 'error' event, which takes the whole
  // process down. pg discards the broken client either way; we only need to
  // observe it.
  pool.on("error", (error) => {
    console.warn("[db] idle client error, connection discarded:", error.message);
  });

  const adapter = new PrismaPg(pool);

  const client = new PrismaClient({
    adapter,
    log: isProduction ? ["error", "warn"] : ["error", "warn"],
  });

  return client.$extends({
    name: "retry-transient-connection-errors",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!RETRYABLE_OPERATIONS.has(operation)) return query(args);
          return withConnectionRetry(() => query(args), `${model}.${operation}`);
        },
      },

      // Raw reads go through the same guard. The marketplace's search and facet
      // queries are raw SQL, and they are the highest-traffic reads in the app —
      // precisely the ones that must not 500 on a recycled socket.
      async $queryRaw({ args, query }) {
        return withConnectionRetry(() => query(args), "$queryRaw");
      },
      async $queryRawUnsafe({ args, query }) {
        return withConnectionRetry(() => query(args), "$queryRawUnsafe");
      },

      // $executeRaw is deliberately NOT retried: it writes.
    },
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (!isProduction) {
  globalForPrisma.prisma = db;
}

export type Db = typeof db;

/** Re-exported so consumers never import from the generated path directly. */
export { Prisma } from "@/generated/prisma/client";
