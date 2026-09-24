import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * OTP challenge lifecycle against an in-memory stand-in for the two Prisma
 * calls it makes. The point is the state machine — attempts, lockout, expiry,
 * single use, supersede-on-resend — not the SQL, so the fake is deliberately
 * tiny and strict: anything the module does that the fake does not model
 * throws rather than silently passing.
 */

type Row = {
  id: string;
  phone: string;
  purpose: string;
  codeHash: string;
  attempts: number;
  maxAttempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  ipHash: string | null;
  createdAt: Date;
};

const rows: Row[] = [];
let seq = 0;

function matches(row: Row, where: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(where)) {
    const actual = row[key as keyof Row];
    if (value !== null && typeof value === "object" && "lt" in (value as object)) {
      const bound = (value as { lt: number | Date }).lt;
      if (actual === null || !(actual < bound)) return false;
    } else if (actual !== value) {
      return false;
    }
  }
  return true;
}

const otpChallenge = {
  async deleteMany({ where }: { where: Record<string, unknown> }) {
    const before = rows.length;
    for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i]!, where)) rows.splice(i, 1);
    return { count: before - rows.length };
  },
  async create({ data }: { data: Omit<Row, "id" | "attempts" | "consumedAt" | "createdAt"> }) {
    const row: Row = {
      ...data,
      id: `otp_${++seq}`,
      attempts: 0,
      consumedAt: null,
      createdAt: new Date(Date.now() + seq), // strictly increasing for orderBy
    };
    rows.push(row);
    return { id: row.id };
  },
  async delete({ where }: { where: { id: string } }) {
    const i = rows.findIndex((r) => r.id === where.id);
    if (i >= 0) rows.splice(i, 1);
  },
  async findFirst({ where }: { where: Record<string, unknown> }) {
    const row = [...rows]
      .filter((r) => matches(r, where))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    // A snapshot, as Prisma returns — a later updateMany must not mutate it.
    return row ? { ...row } : null;
  },
  async updateMany({
    where,
    data,
  }: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }) {
    let count = 0;
    for (const row of rows) {
      if (!matches(row, where)) continue;
      count++;
      if (data.attempts && typeof data.attempts === "object") {
        row.attempts += (data.attempts as { increment: number }).increment;
      }
      if (data.consumedAt instanceof Date) row.consumedAt = data.consumedAt;
    }
    return { count };
  },
};

vi.mock("@/lib/db", () => ({
  db: {
    otpChallenge,
    $transaction: async (fn: (tx: { otpChallenge: typeof otpChallenge }) => Promise<unknown>) =>
      fn({ otpChallenge }),
  },
}));

const sent: { phone: string; code: string }[] = [];
let deliver = true;

vi.mock("@/lib/otp", () => ({
  otpProvider: {
    name: "fake",
    async send(message: { phone: string; code: string }) {
      sent.push(message);
      return deliver;
    },
  },
}));

const { issueOtp, verifyOtp, OTP_MAX_ATTEMPTS, OTP_TTL_MS } = await import("@/lib/otp/challenge");

const PHONE = "+919876543210";
const PURPOSE = "SELLER_SIGNUP" as const;

beforeEach(() => {
  rows.length = 0;
  sent.length = 0;
  deliver = true;
  vi.useRealTimers();
});

describe("issueOtp", () => {
  it("stores a hash, never the code, and sends the code to the provider", async () => {
    const result = await issueOtp({ phone: PHONE, purpose: PURPOSE });
    expect(result.ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.code).toMatch(/^\d{6}$/);
    expect(rows[0]!.codeHash).not.toContain(sent[0]!.code);
    expect(rows[0]!.codeHash).toHaveLength(64);
  });

  it("supersedes an earlier open challenge for the same phone and purpose", async () => {
    await issueOtp({ phone: PHONE, purpose: PURPOSE });
    const first = sent[0]!.code;
    await issueOtp({ phone: PHONE, purpose: PURPOSE });
    expect(rows).toHaveLength(1);
    expect(await verifyOtp({ phone: PHONE, purpose: PURPOSE, code: first })).toMatchObject({
      ok: false,
    });
  });

  it("leaves nothing guessable when delivery fails", async () => {
    deliver = false;
    const result = await issueOtp({ phone: PHONE, purpose: PURPOSE });
    expect(result).toEqual({ ok: false, reason: "delivery_failed" });
    expect(rows).toHaveLength(0);
  });
});

describe("verifyOtp", () => {
  it("accepts the right code once", async () => {
    await issueOtp({ phone: PHONE, purpose: PURPOSE });
    const code = sent[0]!.code;
    expect(await verifyOtp({ phone: PHONE, purpose: PURPOSE, code })).toMatchObject({ ok: true });
    expect(await verifyOtp({ phone: PHONE, purpose: PURPOSE, code })).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  // The "code issued for one purpose cannot verify another" case is not
  // expressible while OtpPurpose has a single value. `verifyOtp` still filters
  // on purpose; restore this test when a second purpose is added.

  it("counts down attempts and locks after the third wrong guess", async () => {
    await issueOtp({ phone: PHONE, purpose: PURPOSE });
    const right = sent[0]!.code;
    const wrong = right === "000000" ? "000001" : "000000";

    expect(await verifyOtp({ phone: PHONE, purpose: PURPOSE, code: wrong })).toEqual({
      ok: false,
      reason: "mismatch",
      attemptsRemaining: OTP_MAX_ATTEMPTS - 1,
    });
    expect(await verifyOtp({ phone: PHONE, purpose: PURPOSE, code: wrong })).toEqual({
      ok: false,
      reason: "mismatch",
      attemptsRemaining: OTP_MAX_ATTEMPTS - 2,
    });
    expect(await verifyOtp({ phone: PHONE, purpose: PURPOSE, code: wrong })).toEqual({
      ok: false,
      reason: "locked",
      attemptsRemaining: 0,
    });
    // Even the right code is refused once locked.
    expect(await verifyOtp({ phone: PHONE, purpose: PURPOSE, code: right })).toEqual({
      ok: false,
      reason: "locked",
    });
  });

  it("rejects a malformed code without spending an attempt", async () => {
    await issueOtp({ phone: PHONE, purpose: PURPOSE });
    expect(await verifyOtp({ phone: PHONE, purpose: PURPOSE, code: "12" })).toEqual({
      ok: false,
      reason: "mismatch",
    });
    expect(rows[0]!.attempts).toBe(0);
  });

  it("expires after the TTL", async () => {
    await issueOtp({ phone: PHONE, purpose: PURPOSE });
    const code = sent[0]!.code;
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + OTP_TTL_MS + 1000);
    expect(await verifyOtp({ phone: PHONE, purpose: PURPOSE, code })).toEqual({
      ok: false,
      reason: "expired",
    });
  });
});
