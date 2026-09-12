/**
 * Transient database-connection handling.
 *
 * Separate from `db.ts` so the classification rules can be unit-tested without
 * constructing a Prisma client — the decision "is this worth retrying?" is the
 * part that has to be right, and it is pure.
 *
 * ── Why retrying is correct rather than papering over a bug ──────────────────
 * Everything between the application and Postgres recycles idle connections on
 * its own schedule: PgBouncer, every managed Postgres proxy, and the local
 * `prisma dev` server. The pool can therefore hand out a socket the far end has
 * already closed, and the first query on it fails for reasons that have nothing
 * to do with the caller. That is an expected condition in any pooled setup, and
 * a visitor should never meet a 500 because of it.
 *
 * What is NOT covered here is a database that is genuinely down. Retrying adds
 * a few hundred milliseconds and then fails honestly, which is what should
 * happen.
 */

/** Error shapes that mean "this connection is dead", not "this query is wrong". */
const TRANSIENT_MESSAGES = [
  "Server has closed the connection",
  "Connection terminated unexpectedly",
  "Connection terminated",
  "ECONNRESET",
  "ECONNREFUSED",
];

/**
 * Error CODES worth retrying.
 *
 * Both families matter, and missing the second is easy:
 *
 *   Prisma —  P1001 cannot reach the server, P1002 timed out, P1017 the server
 *             closed the connection, P2024 timed out taking a connection from
 *             the pool (usually a pool full of dead sockets).
 *   Node   —  the socket-level codes. These arrive on the `code` field with a
 *             message like "Invalid `prisma.$queryRaw()` invocation:", so a
 *             classifier that only inspects the message text misses every one
 *             of them — which is exactly what happened the first time this was
 *             written, and why /search still returned 500 after the retry was
 *             supposedly in place.
 */
const TRANSIENT_CODES = new Set([
  "P1001",
  "P1002",
  "P1017",
  "P2024",
  "ECONNREFUSED",
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
]);

export function isTransientConnectionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && TRANSIENT_CODES.has(code)) return true;

  const message = (error as { message?: unknown }).message;
  if (typeof message !== "string") return false;

  return TRANSIENT_MESSAGES.some((fragment) => message.includes(fragment));
}

/**
 * Operations that are safe to repeat.
 *
 * Reads only, and deliberately so. When a query fails with "the server closed
 * the connection" there is no way to tell whether it ran before the socket
 * died — so retrying a `create` risks inserting the row twice. A read can
 * always be repeated.
 */
export const RETRYABLE_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);

/**
 * Backoff schedule — six attempts in total.
 *
 * Sized against the POOL, not against "a transient blip". When the database is
 * restarted underneath a running server, every pooled socket is dead, and `pg`
 * discards exactly ONE of them per failed query. So a single request has to be
 * able to burn through a pool's worth of corpses before it can reach a healthy
 * connection — with two retries it could not, which is why the product page
 * still showed a crash page after the first version of this shipped.
 *
 * `max` is 5 (see db.ts), so six attempts clears a full pool. The escalating
 * delay also gives a database that is still coming back up time to accept
 * connections. Worst case adds about 2.5 seconds, and only when every attempt
 * is failing — a database that is genuinely down still fails, just not
 * instantly.
 */
export const RETRY_DELAYS_MS = [50, 100, 250, 500, 1000];

/**
 * Run a read, retrying briefly if the connection dropped underneath it.
 *
 * The pool discards the broken client on failure, so the next attempt gets a
 * fresh connection — which is usually all that is needed.
 */
export async function withConnectionRetry<T>(
  run: () => Promise<T>,
  label: string,
  delays: number[] = RETRY_DELAYS_MS,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (!isTransientConnectionError(error)) throw error;

      lastError = error;

      const delay = delays[attempt];
      if (delay === undefined) break;

      console.warn(`[db] ${label}: connection dropped, retrying in ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
