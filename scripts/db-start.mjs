#!/usr/bin/env node
/**
 * Start the local Prisma Postgres server, sync .env.local, and prove it works.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * The local `prisma dev` server has stopped unexpectedly nine times across this
 * project (D24). It always fails the same unhelpful way: the server is gone,
 * but nothing says so until a request deep in the app throws `Connection
 * terminated unexpectedly` — which reads like data corruption rather than a
 * dead server, and sends you debugging the wrong layer.
 *
 * The database is PGlite — Postgres embedded IN the node process, not a
 * separate service. So when that process dies, the database dies with it and
 * leaves its lock files behind. The next start then fails with `Lock file is
 * already being held`, naming a holder that no longer exists, and `prisma dev
 * stop` cannot clear it because there is nothing left to stop. Clearing those
 * files by hand was the fix every single time.
 *
 * This script therefore does three things the raw command does not:
 *
 *   1. Clears lock files left by a dead process — but only after confirming no
 *      server is actually listening, so a live server is never unlocked.
 *   2. Re-syncs the port in .env.local. A NAMED server keeps its port across
 *      restarts, so this is usually a no-op — but an unnamed `default` server
 *      (which `prisma dev status` will happily start for you) gets a different
 *      one, and mixing the two produces a URL pointing at nothing.
 *   3. Refuses to report success until it has actually run a query. Printing a
 *      port proves only that a banner was printed.
 *
 * Only the port in the two local URLs is rewritten. The rest of the connection
 * string, and every other variable in the file, is preserved.
 */

import { spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, rmSync, readdirSync, statSync } from "node:fs";
import { createConnection } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";

const SERVER_NAME = "bzaro";
const ENV_FILE = ".env.local";
const STARTUP_TIMEOUT_MS = 90_000;

/** Ports only ever move for local servers; never rewrite a remote URL. */
const LOCAL_HOST = /^postgres:\/\/postgres:postgres@localhost:\d+\//;

/** Where `prisma dev` keeps its per-server state on this platform. */
function stateDir() {
  const appData =
    process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
  return join(appData, "prisma-dev-nodejs", "Data");
}

/** Is anything actually listening on this port? */
function isListening(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(1500);
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.once("timeout", () => done(false));
  });
}

/**
 * Read the port a previous run recorded, so we can tell a live server from a
 * dead one before touching any lock.
 */
function recordedPort() {
  try {
    const file = join(stateDir(), SERVER_NAME, "server.json");
    return JSON.parse(readFileSync(file, "utf8")).databasePort ?? null;
  } catch {
    return null;
  }
}

/**
 * Delete lock files orphaned by a dead process.
 *
 * Gated on a liveness probe: if something is still listening on the recorded
 * port, the lock is legitimate and we leave it alone. Unlocking a running
 * PGlite database would risk two processes writing the same files.
 *
 * Note the locks come in both shapes — `server.lock` is a file, its companion
 * `server.lock.lock` is a DIRECTORY — so removal has to be recursive.
 */
async function clearStaleLocks() {
  const port = recordedPort();
  if (port && (await isListening(port))) return 0;

  const root = stateDir();
  if (!existsSync(root)) return 0;

  const cleared = [];

  const walk = (dir, depth = 0) => {
    if (depth > 3) return;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);

      if (entry.endsWith(".lock")) {
        rmSync(full, { recursive: true, force: true });
        cleared.push(full);
        continue;
      }

      // Never descend into the data directory; the database lives there.
      if (entry === ".pglite") continue;

      try {
        if (statSync(full).isDirectory()) walk(full, depth + 1);
      } catch {
        /* a file that vanished mid-walk is not our problem */
      }
    }
  };

  walk(root);
  return cleared.length;
}

function stopExisting() {
  // A server left running from a previous session holds the old port. Stopping
  // is idempotent: a "not running" exit is the state we want, not a failure.
  spawnSync("npx", ["prisma", "dev", "stop", SERVER_NAME], {
    stdio: "ignore",
    shell: true,
  });
}

/**
 * Start the server and resolve with the port it reports.
 *
 * The port is parsed from the banner rather than probed, because probing for a
 * listening port cannot distinguish our server from anything else that happens
 * to be listening.
 */
function start() {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["prisma", "dev", "-d", "-n", SERVER_NAME], {
      shell: true,
    });

    let output = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`Server did not report a port within ${STARTUP_TIMEOUT_MS / 1000}s.\n${output}`));
    }, STARTUP_TIMEOUT_MS);

    /**
     * Pull the database port out of whatever the command printed.
     *
     * Two output shapes, depending on the flags: the detached run prints a bare
     * connection string, the foreground run prints a labelled banner listing
     * DATABASE_URL before SHADOW_DATABASE_URL. Match the labelled form first so
     * the shadow port is never mistaken for the main one.
     */
    function parsePort(raw) {
      // The banner is ANSI-coloured, so the digits are not adjacent to the
      // colon in the raw stream. Strip escapes before matching.
      const plain = raw.replace(/\[[0-9;]*m/g, "");

      const match =
        plain.match(/DATABASE_URL="postgres:\/\/postgres:postgres@localhost:(\d+)\//) ??
        plain.match(/postgres:\/\/postgres:postgres@localhost:(\d+)\//);

      return match?.[1] ?? null;
    }

    function settle(port) {
      if (settled) return true;
      if (!port) return false;
      settled = true;
      clearTimeout(timer);
      resolve({ port, child });
      return true;
    }

    function scan(chunk) {
      output += chunk.toString();
      settle(parsePort(output));
    }

    child.stdout.on("data", scan);
    child.stderr.on("data", scan);

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`prisma dev exited with code ${code}.\n${output}`));
    });
  });
}

function syncEnv(port) {
  if (!existsSync(ENV_FILE)) {
    throw new Error(`${ENV_FILE} not found — copy .env.example first.`);
  }

  const original = readFileSync(ENV_FILE, "utf8");
  let changed = 0;

  const updated = original
    .split("\n")
    .map((line) => {
      const match = line.match(/^(DATABASE_URL|DIRECT_DATABASE_URL)="(.*)"$/);
      if (!match) return line;

      const [, key, url] = match;
      if (!LOCAL_HOST.test(url)) return line; // a remote URL is never rewritten

      const next = url.replace(/@localhost:\d+\//, `@localhost:${port}/`);
      if (next !== url) changed += 1;

      return `${key}="${next}"`;
    })
    .join("\n");

  if (changed > 0) writeFileSync(ENV_FILE, updated);
  return changed;
}

/**
 * Connect and run a trivial query.
 *
 * Retried briefly: the server accepts TCP slightly before it is ready to
 * answer, so a single immediate attempt reports a false failure.
 */
async function verify(port) {
  const { default: pg } = await import("pg");
  const url = `postgres://postgres:postgres@localhost:${port}/template1?sslmode=disable`;

  let lastError;

  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 3000 });
    try {
      await client.connect();
      await client.query("SELECT 1");
      await client.end();
      return;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw new Error(
    `Server reported port ${port} but refused queries: ${lastError?.message ?? lastError}`,
  );
}

try {
  stopExisting();

  const cleared = await clearStaleLocks();
  if (cleared > 0) {
    console.log(`Cleared ${cleared} lock file(s) left by a previous crash.`);
  }

  const { port } = await start();
  const changed = syncEnv(port);
  await verify(port);

  console.log(`Local Postgres is up on port ${port} and answering queries.`);
  console.log(
    changed > 0
      ? `Updated ${changed} URL(s) in ${ENV_FILE}.`
      : `${ENV_FILE} already pointed at ${port}.`,
  );
  console.log("Next: npm run db:deploy && npm run db:seed");

  // The server runs detached (-d); nothing to wait on.
  process.exit(0);
} catch (error) {
  console.error(`Could not start the local database.\n${error.message}`);
  process.exit(1);
}
