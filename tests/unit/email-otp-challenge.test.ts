import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Email OTP lifecycle against an in-memory stand-in for the Prisma calls it
 * makes. Mirrors otp-challenge.test.ts: the point is the state machine —
 * attempts, lockout, expiry, single use, supersede-on-resend, and the resend
 * cooldown that the phone challenge does not have.
 */

type Row = {
  id: string;
  email: string;
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
/** Lets a test place a row in the past without waiting a real minute. */
let createdAtOverride: Date | null = null;

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

const emailOtp = {
  async deleteMany({ where }: { where: Record<string, unknown> }) {
    const before = rows.length;
    for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i]!, where)) rows.splice(i, 1);
    return { count: before - rows.length };
  },
  async create({ data }: { data: Omit<Row, "id" | "attempts" | "consumedAt" | "createdAt"> }) {
    const row: Row = {
      ...data,
      id: `eotp_${++seq}`,
      attempts: 0,
      consumedAt: null,
      createdAt: createdAtOverride ?? new Date(Date.now() + seq),
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
    emailOtp,
    $transaction: async (fn: (tx: { emailOtp: typeof emailOtp }) => Promise<unknown>) =>
      fn({ emailOtp }),
  },
}));

const sent: { to: string; subject: string; text: string }[] = [];
let deliver = true;

vi.mock("@/lib/mail", () => ({
  mailer: {
    name: "fake",
    async send(message: { to: string; subject: string; text: string }) {
      sent.push(message);
      return deliver;
    },
  },
}));

const {
  issueEmailOtp,
  verifyEmailOtp,
  EMAIL_OTP_MAX_ATTEMPTS,
  EMAIL_OTP_TTL_MS,
  EMAIL_OTP_RESEND_COOLDOWN_MS,
} = await import("@/lib/otp/email-challenge");

const EMAIL = "buyer@example.com";
const PURPOSE = "SIGNUP" as const;

/** The code is only ever in the delivered message — never in the row. */
function codeFromLastEmail(): string {
  const text = sent.at(-1)!.text;
  return /\b(\d{6})\b/.exec(text)![1]!;
}

beforeEach(() => {
  rows.length = 0;
  sent.length = 0;
  seq = 0;
  deliver = true;
  createdAtOverride = null;
});

describe("issueEmailOtp", () => {
  it("stores only a hash, never the code itself", async () => {
    await issueEmailOtp({ email: EMAIL, purpose: PURPOSE });

    const code = codeFromLastEmail();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.codeHash).not.toContain(code);
    expect(rows[0]!.codeHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("puts the code in the subject so it is readable from a notification", async () => {
    await issueEmailOtp({ email: EMAIL, purpose: PURPOSE });
    expect(sent.at(-1)!.subject).toContain(codeFromLastEmail());
  });

  it("refuses a resend inside the cooldown", async () => {
    await issueEmailOtp({ email: EMAIL, purpose: PURPOSE });
    const result = await issueEmailOtp({ email: EMAIL, purpose: PURPOSE });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("cooldown");
    // The first code must still be the live one.
    expect(rows).toHaveLength(1);
  });

  it("supersedes the previous code once the cooldown has passed", async () => {
    createdAtOverride = new Date(Date.now() - EMAIL_OTP_RESEND_COOLDOWN_MS - 1000);
    await issueEmailOtp({ email: EMAIL, purpose: PURPOSE });
    const firstCode = codeFromLastEmail();

    createdAtOverride = null;
    const result = await issueEmailOtp({ email: EMAIL, purpose: PURPOSE });
    expect(result.ok).toBe(true);
    expect(rows).toHaveLength(1);

    // The old code stops working rather than leaving two live.
    const stale = await verifyEmailOtp({ email: EMAIL, purpose: PURPOSE, code: firstCode });
    expect(stale.ok).toBe(false);
  });

  it("leaves nothing guessable behind when delivery fails", async () => {
    deliver = false;
    const result = await issueEmailOtp({ email: EMAIL, purpose: PURPOSE });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("delivery_failed");
    expect(rows).toHaveLength(0);
  });
});

describe("verifyEmailOtp", () => {
  it("accepts the right code exactly once", async () => {
    await issueEmailOtp({ email: EMAIL, purpose: PURPOSE });
    const code = codeFromLastEmail();

    expect(await verifyEmailOtp({ email: EMAIL, purpose: PURPOSE, code })).toEqual({ ok: true });

    const replay = await verifyEmailOtp({ email: EMAIL, purpose: PURPOSE, code });
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.reason).toBe("invalid");
  });

  it("counts down attempts and locks after the fifth wrong guess", async () => {
    await issueEmailOtp({ email: EMAIL, purpose: PURPOSE });
    const right = codeFromLastEmail();
    const wrong = right === "000000" ? "000001" : "000000";

    for (let attempt = 1; attempt < EMAIL_OTP_MAX_ATTEMPTS; attempt++) {
      const result = await verifyEmailOtp({ email: EMAIL, purpose: PURPOSE, code: wrong });
      expect(result).toMatchObject({
        ok: false,
        reason: "mismatch",
        attemptsRemaining: EMAIL_OTP_MAX_ATTEMPTS - attempt,
      });
    }

    expect(await verifyEmailOtp({ email: EMAIL, purpose: PURPOSE, code: wrong })).toMatchObject({
      ok: false,
      reason: "locked",
    });

    // Locked means locked — even the correct code is refused now.
    expect(await verifyEmailOtp({ email: EMAIL, purpose: PURPOSE, code: right })).toMatchObject({
      ok: false,
      reason: "locked",
    });
  });

  it("rejects a code past its expiry", async () => {
    await issueEmailOtp({ email: EMAIL, purpose: PURPOSE });
    const code = codeFromLastEmail();
    rows[0]!.expiresAt = new Date(Date.now() - 1);

    expect(await verifyEmailOtp({ email: EMAIL, purpose: PURPOSE, code })).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("does not accept a signup code for a password reset", async () => {
    await issueEmailOtp({ email: EMAIL, purpose: PURPOSE });
    const code = codeFromLastEmail();

    expect(await verifyEmailOtp({ email: EMAIL, purpose: "RESET_PASSWORD", code })).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("does not accept another address's code", async () => {
    await issueEmailOtp({ email: EMAIL, purpose: PURPOSE });
    const code = codeFromLastEmail();

    expect(
      await verifyEmailOtp({ email: "someone.else@example.com", purpose: PURPOSE, code }),
    ).toEqual({ ok: false, reason: "invalid" });
  });

  it("gives the buyer the full ten minutes", async () => {
    await issueEmailOtp({ email: EMAIL, purpose: PURPOSE });
    expect(rows[0]!.expiresAt.getTime() - Date.now()).toBeGreaterThan(EMAIL_OTP_TTL_MS - 5_000);
  });
});
