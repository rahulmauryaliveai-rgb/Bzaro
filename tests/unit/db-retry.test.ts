import { describe, expect, it, vi } from "vitest";
import {
  isTransientConnectionError,
  RETRYABLE_OPERATIONS,
  withConnectionRetry,
} from "@/lib/db-retry";

/**
 * Transient-connection retry.
 *
 * Two things have to be right, and they pull in opposite directions:
 *
 *   - a dropped connection must be retried, or every recycled socket becomes a
 *     500 the visitor sees;
 *   - a real error must NOT be retried, or a genuine bug is hidden behind three
 *     attempts and a delay.
 *
 * Most of these tests are about the second.
 */

describe("isTransientConnectionError", () => {
  it("recognises a closed connection", () => {
    // The exact message behind the crash page on /search.
    expect(
      isTransientConnectionError(
        new Error("Raw query failed. Message: `Server has closed the connection.`"),
      ),
    ).toBe(true);

    expect(isTransientConnectionError(new Error("Connection terminated unexpectedly"))).toBe(true);
    expect(isTransientConnectionError(new Error("read ECONNRESET"))).toBe(true);
  });

  it("recognises Prisma's own connection codes", () => {
    expect(isTransientConnectionError({ code: "P1001", message: "unreachable" })).toBe(true);
    expect(isTransientConnectionError({ code: "P1017", message: "closed" })).toBe(true);
    expect(isTransientConnectionError({ code: "P2024", message: "pool timeout" })).toBe(true);
  });

  it("recognises socket errors that carry the code but NOT the message", () => {
    // Regression, and the reason /search still 500'd after the retry was first
    // added: Prisma reports these with an unhelpful message and the real cause
    // only on `code`, so checking the message text alone misses all of them.
    expect(
      isTransientConnectionError({
        code: "ECONNREFUSED",
        message: "Invalid `prisma.$queryRaw()` invocation:",
      }),
    ).toBe(true);

    for (const code of ["ECONNRESET", "EPIPE", "ETIMEDOUT", "EHOSTUNREACH"]) {
      expect(
        isTransientConnectionError({ code, message: "Invalid `prisma.findMany()` invocation:" }),
        `${code} should be transient`,
      ).toBe(true);
    }
  });

  it("does NOT treat real query errors as transient", () => {
    // These are bugs. Retrying them wastes time and hides the cause.
    expect(isTransientConnectionError({ code: "P2002", message: "Unique constraint failed" })).toBe(
      false,
    );
    expect(isTransientConnectionError({ code: "P2025", message: "Record not found" })).toBe(false);
    expect(isTransientConnectionError(new Error("column c.oldSlug does not exist"))).toBe(false);
    expect(isTransientConnectionError(new Error("syntax error at or near"))).toBe(false);
  });

  it("survives being handed something that is not an error", () => {
    for (const value of [null, undefined, "", 0, [], {}, { code: 42 }, { message: 7 }]) {
      expect(isTransientConnectionError(value)).toBe(false);
    }
  });
});

describe("RETRYABLE_OPERATIONS", () => {
  it("covers the reads", () => {
    for (const operation of [
      "findUnique",
      "findFirst",
      "findMany",
      "count",
      "aggregate",
      "groupBy",
    ]) {
      expect(RETRYABLE_OPERATIONS.has(operation), `${operation} should be retryable`).toBe(true);
    }
  });

  it("excludes every write", () => {
    // The important half. A `create` that failed with "connection closed" may
    // have committed before the socket died, so repeating it would insert the
    // row twice — worse than the error it is trying to smooth over.
    for (const operation of [
      "create",
      "createMany",
      "createManyAndReturn",
      "update",
      "updateMany",
      "upsert",
      "delete",
      "deleteMany",
    ]) {
      expect(RETRYABLE_OPERATIONS.has(operation), `${operation} must not be retried`).toBe(false);
    }
  });
});

describe("withConnectionRetry", () => {
  it("returns the result when the first attempt succeeds", async () => {
    const run = vi.fn().mockResolvedValue("ok");

    await expect(withConnectionRetry(run, "test", [1, 1])).resolves.toBe("ok");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("retries a dropped connection and succeeds on the second attempt", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("Server has closed the connection"))
      .mockResolvedValue("recovered");

    await expect(withConnectionRetry(run, "test", [1, 1])).resolves.toBe("recovered");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("gives up after the configured attempts and rethrows the real error", async () => {
    const error = new Error("Connection terminated unexpectedly");
    const run = vi.fn().mockRejectedValue(error);

    // A database that is genuinely down must still fail — honestly, and with
    // the original error rather than a wrapped one.
    await expect(withConnectionRetry(run, "test", [1, 1])).rejects.toBe(error);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("does not retry a non-transient error at all", async () => {
    const error = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    const run = vi.fn().mockRejectedValue(error);

    await expect(withConnectionRetry(run, "test", [1, 1])).rejects.toBe(error);
    expect(run, "a real error should fail immediately").toHaveBeenCalledTimes(1);
  });
});
