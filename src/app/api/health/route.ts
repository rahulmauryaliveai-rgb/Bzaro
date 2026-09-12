import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Health check for load balancers and uptime monitoring.
 *
 * Verifies the database round-trips rather than just that the process is alive.
 * A Next.js server that boots fine but cannot reach Postgres serves 500s to
 * every page, and a liveness probe that only checks the process would keep it
 * happily in rotation.
 *
 * Deliberately leaks nothing: no version, no connection string, no error
 * detail. A health endpoint is unauthenticated and world-reachable.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const startedAt = Date.now();

  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: "ok", latencyMs: Date.now() - startedAt },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { status: "degraded" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
