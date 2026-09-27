/**
 * Weekly + daily MARKET-lead delivery (decision D41). Pure, so the rules that
 * decide who gets a lead are unit-tested without a database.
 *
 * A plan delivers up to `weeklyLeadQuota` matched leads per IST week (Monday
 * 00:00 → next Monday 00:00). Once those are used, it may deliver
 * `dailyLeadQuota` more per IST day — the "lead of the day". A weekly lead
 * expires when the week ends, a daily lead at the end of the next day. Every
 * lead gets at least MIN_LIFETIME so a lead delivered late on Sunday night is
 * still actionable.
 *
 * Quotas govern DELIVERY. Unlocking a delivered lead's contact still costs one
 * credit (docs/LEADS.md §4) — the two are independent on purpose.
 */

export type LeadSlotName = "WEEKLY" | "DAILY";

const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 86_400_000;
export const MIN_LEAD_LIFETIME_MS = DAY_MS;

/** Start of the IST day containing `now`, as a UTC instant. */
export function istDayStart(now: Date): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const midnight = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  return new Date(midnight - IST_OFFSET_MS);
}

/** Monday 00:00 IST of the week containing `now`, as a UTC instant. */
export function istWeekStart(now: Date): Date {
  const day = istDayStart(now);
  const ist = new Date(day.getTime() + IST_OFFSET_MS);
  const sinceMonday = (ist.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - sinceMonday * DAY_MS);
}

export function istWeekEnd(now: Date): Date {
  return new Date(istWeekStart(now).getTime() + 7 * DAY_MS);
}

export type QuotaInput = {
  /** null = no weekly cap. */
  weeklyQuota: number | null;
  dailyQuota: number;
  /** MARKET leads this seller received since the week started (any slot counts as weekly except DAILY). */
  weeklyUsed: number;
  /** DAILY-slot leads received since today started. */
  dailyUsedToday: number;
};

/** Which allowance a new lead would use, or null when the seller is full. */
export function chooseSlot(input: QuotaInput): LeadSlotName | null {
  if (input.weeklyQuota === null || input.weeklyUsed < input.weeklyQuota) return "WEEKLY";
  if (input.dailyUsedToday < input.dailyQuota) return "DAILY";
  return null;
}

export function slotExpiry(slot: LeadSlotName, now: Date): Date {
  const natural =
    slot === "WEEKLY" ? istWeekEnd(now) : new Date(istDayStart(now).getTime() + 2 * DAY_MS);
  const floor = now.getTime() + MIN_LEAD_LIFETIME_MS;
  return new Date(Math.max(natural.getTime(), floor));
}

/** What the inbox shows: "7 of 10 this week". */
export function weeklyProgress(input: Pick<QuotaInput, "weeklyQuota" | "weeklyUsed">) {
  if (input.weeklyQuota === null) return null;
  return {
    used: Math.min(input.weeklyUsed, input.weeklyQuota),
    quota: input.weeklyQuota,
    exhausted: input.weeklyUsed >= input.weeklyQuota,
  };
}
