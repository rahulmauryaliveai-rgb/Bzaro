import { config as loadEnv } from "dotenv";

/**
 * The lead worker (decision D29, docs/LEADS.md §5).
 *
 * A long-running Node process, separate from the Next.js server, that drains
 * two outboxes and runs the expiry sweep:
 *
 *   Requirement  fanoutStatus = PENDING  → matcher → MARKET leads
 *   LeadDelivery status = PENDING        → LeadNotifier
 *   Lead         MARKET, past expiresAt  → EXPIRED
 *
 * ── Running it ───────────────────────────────────────────────────────────────
 *   npm run worker                        (development)
 *   pm2 start npm --name bzaro-worker -- run worker   (production, see
 *   docs/DEPLOYMENT.md §6)
 *
 * The script runs under `tsx --conditions=react-server`, which resolves the
 * `server-only` marker to its empty module so the shared service layer can be
 * imported outside Next.js. Nothing in here, or in anything it imports, may
 * touch `next/*` — `next/cache` in particular throws outside a request.
 *
 * ── Shape ────────────────────────────────────────────────────────────────────
 * One loop, one tick at a time, never overlapping. Each tick drains what is
 * pending and then sleeps POLL_MS. Several worker processes can run side by
 * side: every claim is `FOR UPDATE SKIP LOCKED`, so they never take the same
 * row. Errors on one row are recorded on that row and never stop the loop.
 */

// Same precedence Next.js uses, so the worker sees the values the app sees.
// This is the one place NODE_ENV is read raw: it decides which files to load
// BEFORE the validated `@/env` module can exist.
// eslint-disable-next-line no-restricted-properties
const nodeEnv = process.env.NODE_ENV ?? "development";
for (const file of [`.env.${nodeEnv}.local`, ".env.local", `.env.${nodeEnv}`, ".env"]) {
  loadEnv({ path: file, quiet: true });
}

const FANOUT_BATCH = 10;
const DELIVERY_BATCH = 20;

let stopping = false;

function log(message: string, extra?: Record<string, unknown>): void {
  const stamp = new Date().toISOString();
  process.stdout.write(`[worker ${stamp}] ${message}${extra ? " " + JSON.stringify(extra) : ""}
`);
}

async function drainFanout(): Promise<number> {
  const { claimNextRequirement, processRequirement, failRequirement } =
    await import("@/server/services/fanout.service");
  let processed = 0;
  for (let i = 0; i < FANOUT_BATCH && !stopping; i++) {
    const id = await claimNextRequirement();
    if (!id) break;
    try {
      const outcome = await processRequirement(id);
      log("fanout", { id, ...outcome });
    } catch (error) {
      log("fanout failed", { id, error: error instanceof Error ? error.message : String(error) });
      await failRequirement(id, error).catch(() => undefined);
    }
    processed += 1;
  }
  return processed;
}

async function drainDeliveries(): Promise<number> {
  const { claimPendingDeliveries, processDelivery } =
    await import("@/server/services/delivery.service");
  const ids = await claimPendingDeliveries(DELIVERY_BATCH);
  for (const id of ids) {
    if (stopping) break;
    try {
      const outcome = await processDelivery(id);
      if (outcome !== "SENT") log("delivery", { id, outcome });
    } catch (error) {
      // The lease expires in a minute and the row is retried; after
      // DELIVERY_MAX_ATTEMPTS the processor marks it FAILED.
      log("delivery threw", { id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return ids.length;
}

async function sweepExpiry(): Promise<void> {
  const { expireMarketLeads } = await import("@/server/services/fanout.service");
  const expired = await expireMarketLeads();
  if (expired > 0) log("expired market leads", { expired });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  // Imported only now, after dotenv, so validation sees the loaded values.
  const { env } = await import("@/env");
  const POLL_MS = env.WORKER_POLL_MS;
  const EXPIRY_SWEEP_MS = env.WORKER_EXPIRY_SWEEP_MS;

  log("starting", { pollMs: POLL_MS, expirySweepMs: EXPIRY_SWEEP_MS, nodeEnv });

  let lastSweep = 0;

  while (!stopping) {
    const tickStart = Date.now();
    try {
      if (tickStart - lastSweep >= EXPIRY_SWEEP_MS) {
        await sweepExpiry();
        lastSweep = tickStart;
      }
      const fanned = await drainFanout();
      const delivered = await drainDeliveries();
      // Busy: skip the sleep and go again — a burst of requirements should
      // not wait POLL_MS between each batch.
      if (fanned >= FANOUT_BATCH || delivered >= DELIVERY_BATCH) continue;
    } catch (error) {
      // A dropped database connection lands here. Log, back off, keep going.
      log("tick failed", { error: error instanceof Error ? error.message : String(error) });
      await sleep(POLL_MS * 5);
      continue;
    }
    await sleep(POLL_MS);
  }

  log("stopped");
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (stopping) process.exit(1); // second signal: give up waiting
    log(`received ${signal}, finishing current tick`);
    stopping = true;
  });
}

main().catch((error) => {
  console.error("[worker] fatal:", error);
  process.exit(1);
});
