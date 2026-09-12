import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { JOBS, type JobName } from "@/server/jobs";
import { env } from "@/env";

/**
 * Scheduled job endpoint.
 *
 * ── Authentication ───────────────────────────────────────────────────────────
 * These endpoints mutate data and can be expensive, so they are world-reachable
 * URLs that must not be world-runnable. Two accepted credentials:
 *
 *   1. `Authorization: Bearer <CRON_SECRET>` — Vercel Cron sends this
 *      automatically when CRON_SECRET is set on the project.
 *   2. `Authorization: Bearer <REVALIDATE_SECRET>` — for manual invocation and
 *      for schedulers that are not Vercel.
 *
 * Comparison is timing-safe. An unauthenticated request gets 404, not 401:
 * a 401 confirms the endpoint exists and invites brute force, while a 404 tells
 * a scanner nothing.
 *
 * ── Runtime ──────────────────────────────────────────────────────────────────
 * `maxDuration` is raised because `recompute-indexability` walks every seller.
 * At 10,000 sellers this will eventually exceed even the extended limit — at
 * which point it needs to become a paginated job driven by a queue. That is a
 * known cliff, noted in docs/RUNBOOK.md rather than pretended away.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorised(request: NextRequest): boolean {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return false;

  const accepted = [env.CRON_SECRET, env.REVALIDATE_SECRET].filter((value): value is string =>
    Boolean(value),
  );

  return accepted.some((secret) => {
    const a = Buffer.from(token);
    const b = Buffer.from(secret);
    // Length differs → not equal, and length is not itself a secret.
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ job: string }> }) {
  const { job } = await params;

  if (!isAuthorised(request)) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (!(job in JOBS)) {
    return NextResponse.json(
      { error: "Unknown job", available: Object.keys(JOBS) },
      { status: 400 },
    );
  }

  try {
    const result = await JOBS[job as JobName]();

    // The response body IS the observability for these until Sentry is wired
    // up. Vercel's cron log shows it, so it must say what actually happened —
    // "ok" alone would hide a job that ran and did nothing.
    return NextResponse.json(result, {
      status: result.ok ? 200 : 500,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error(`[cron] ${job} failed:`, error);
    return NextResponse.json(
      { job, ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
