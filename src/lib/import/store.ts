import "server-only";
import { Redis } from "@upstash/redis";
import { randomUUID } from "node:crypto";
import { env } from "@/env";
import type { ParsedRow } from "@/lib/import/parse";

/**
 * Where a parsed spreadsheet waits while the seller looks at the preview (D49).
 *
 * ── Why the rows are kept server-side at all ────────────────────────────────
 * Two reasons, and the second is the one that matters.
 *
 * The convenience: the seller does not re-upload a 3 MB file to confirm an
 * import they have just reviewed, and on a phone connection in a market town
 * that is the difference between the feature working and not.
 *
 * The integrity: if the preview handed the rows to the browser and the import
 * read them back, the import would be writing whatever the browser chose to
 * return. Price, category, status, somebody else's product id — all of it
 * client-controlled, with the preview providing nothing but a false sense that
 * the data had been checked. Keeping the parsed rows here means the import
 * writes exactly what was previewed, and the request carries only a batch id.
 *
 * ── The seller id is part of the key, and checked again on read ─────────────
 * A batch id is a bearer token for "import these rows". Namespacing the key by
 * seller means one seller's id cannot name another's batch, and the stored
 * payload repeats the seller id so a key collision cannot cross the boundary
 * either.
 *
 * ── Thirty minutes ─────────────────────────────────────────────────────────
 * Long enough to fix a few rows in the spreadsheet and come back, short enough
 * that a batch cannot be replayed days later against a catalogue that has
 * moved on. An expired batch is not an error worth hiding: the seller is told
 * to upload the file again.
 */

const TTL_SECONDS = 30 * 60;

export type StagedBatch = {
  id: string;
  sellerId: string;
  /** The ImportJob row this batch belongs to. */
  jobId: string;
  fileName: string;
  fileSize: number;
  rows: ParsedRow[];
  counts: { total: number; create: number; update: number; error: number; overLimit: number };
  createdAt: number;
};

const hasUpstash = Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);

const redis = hasUpstash
  ? new Redis({
      url: env.UPSTASH_REDIS_REST_URL!,
      token: env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

type MemoryEntry = { value: StagedBatch; expiresAt: number };

declare global {
  var __stagedImports: Map<string, MemoryEntry> | undefined;
}

/**
 * Development fallback, mirroring `lib/ratelimit.ts`.
 *
 * ── Why this hangs off globalThis ──────────────────────────────────────────
 * A plain module-level Map does not work here, and the way it fails is
 * invisible. The upload is a route handler and the preview is a page, and
 * under Turbopack those are separate module graphs — so each gets its OWN
 * instance of this module, the route handler writes into one Map and the page
 * reads an empty other one. The seller sees "this upload has expired"
 * immediately, every time, with nothing in any log. Hot reloading would do the
 * same thing on every edit.
 *
 * `globalThis` is the same escape hatch `lib/db.ts` uses for the Prisma client
 * and `lib/media` for the provider, for the same reason.
 *
 * Still per-PROCESS, so it is useless across serverless instances: a preview
 * served by one instance is not found by another. Acceptable on a laptop, not
 * acceptable in production — `warnIfUnbacked` makes that loud rather than
 * mysterious.
 */
const memory: Map<string, MemoryEntry> = globalThis.__stagedImports ?? new Map();

if (!hasUpstash) globalThis.__stagedImports = memory;

let warned = false;

function warnIfUnbacked(): void {
  if (hasUpstash || env.NODE_ENV !== "production" || warned) return;
  warned = true;
  console.error(
    "[import] No Upstash Redis configured. Staged imports are being held in " +
      "process memory, which does not survive a restart and is not shared " +
      "across instances — sellers will see previews expire at random. Set " +
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
  );
}

function keyFor(sellerId: string, batchId: string): string {
  return `import:${sellerId}:${batchId}`;
}

export async function stageBatch(
  batch: Omit<StagedBatch, "id" | "createdAt">,
): Promise<StagedBatch> {
  warnIfUnbacked();

  const staged: StagedBatch = { ...batch, id: randomUUID(), createdAt: Date.now() };
  const key = keyFor(staged.sellerId, staged.id);

  if (redis) await redis.set(key, staged, { ex: TTL_SECONDS });
  else {
    sweepMemory();
    memory.set(key, { value: staged, expiresAt: Date.now() + TTL_SECONDS * 1000 });
  }

  return staged;
}

/**
 * Read a batch back, for THIS seller only.
 *
 * Returns null for an unknown, expired or foreign batch without distinguishing
 * them: the caller has no legitimate need to know which, and saying "that
 * batch belongs to someone else" would confirm it exists.
 */
export async function readBatch(sellerId: string, batchId: string): Promise<StagedBatch | null> {
  if (!sellerId || !batchId) return null;

  const key = keyFor(sellerId, batchId);

  const staged = redis
    ? await redis.get<StagedBatch>(key).catch(() => null)
    : readMemory(key);

  if (!staged) return null;

  // Belt and braces: the key already contains the seller id, so a mismatch
  // here means something is badly wrong rather than merely unauthorised.
  if (staged.sellerId !== sellerId) return null;

  return staged;
}

/** Drop a batch once it has been imported, so it cannot be replayed. */
export async function discardBatch(sellerId: string, batchId: string): Promise<void> {
  const key = keyFor(sellerId, batchId);
  if (redis) await redis.del(key).catch(() => undefined);
  else memory.delete(key);
}

function readMemory(key: string): StagedBatch | null {
  const entry = memory.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    memory.delete(key);
    return null;
  }
  return entry.value;
}

/** Keeps a long-running dev server from holding every batch ever parsed. */
function sweepMemory(): void {
  const now = Date.now();
  for (const [key, entry] of memory) if (entry.expiresAt < now) memory.delete(key);
}
