import "server-only";
import type { z } from "zod";
import { db } from "@/lib/db";
import type { InputJsonValue } from "@/generated/prisma/internal/prismaNamespace";

/**
 * Typed reads of the `Setting` table.
 *
 * Every settings row is a JSON blob validated by a Zod schema on the way out,
 * with a hard-coded default when the row is missing or malformed. A corrupt
 * admin edit therefore degrades to "defaults", never to "feature down".
 *
 * ── Memoised for a short window ──────────────────────────────────────────────
 * The lead worker reads the same row every poll and the request path reads it
 * on every requirement. A 30-second in-process memo keeps that off the
 * database without making an admin edit feel broken — the old value survives
 * for at most one memo window on each instance.
 *
 * `react.cache` is not used here because the worker runs outside React.
 */

const MEMO_TTL_MS = 30_000;

type MemoEntry = { value: unknown; expiresAt: number };
const memo = new Map<string, MemoEntry>();

export async function getSetting<S extends z.ZodTypeAny>(
  key: string,
  schema: S,
  defaults: z.infer<S>,
): Promise<z.infer<S>> {
  const now = Date.now();
  const cached = memo.get(key);
  if (cached && cached.expiresAt > now) return cached.value as z.infer<S>;

  const row = await db.setting.findUnique({ where: { key }, select: { value: true } });

  let value: z.infer<S> = defaults;
  if (row) {
    const parsed = schema.safeParse(row.value);
    if (parsed.success) {
      value = parsed.data;
    } else {
      console.error(`[settings] "${key}" failed validation, using defaults:`, parsed.error.issues);
    }
  }

  memo.set(key, { value, expiresAt: now + MEMO_TTL_MS });
  return value;
}

/** Validate and persist. Drops the memo so the next read sees the new value. */
export async function setSetting<S extends z.ZodTypeAny>(
  key: string,
  schema: S,
  input: unknown,
): Promise<z.infer<S>> {
  const value = schema.parse(input);
  // Zod output is `unknown` to Prisma; the schema guarantees plain JSON.
  const json = value as InputJsonValue;
  await db.setting.upsert({
    where: { key },
    create: { key, value: json },
    update: { value: json },
  });
  memo.delete(key);
  return value;
}

/** Test seam and post-write hook. */
export function clearSettingsMemo(): void {
  memo.clear();
}
