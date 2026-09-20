import { Prisma } from "@/generated/prisma/client";

/**
 * Recognise a unique-constraint violation on one column, so an action can
 * turn "P2002 on Seller.gstin" into a field error instead of a 500. Prisma
 * reports the constraint name in the message (`Seller_gstin_key`) and, with
 * the pg adapter, the column list in `meta.target`; check both.
 */
export function isUniqueViolation(error: unknown, model: string, column: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  const columns = Array.isArray(target)
    ? target.map(String)
    : typeof target === "string"
      ? [target]
      : [];
  return error.message.includes(`${model}_${column}_key`) || columns.includes(column);
}

export const GSTIN_TAKEN = "This GSTIN is already registered to another business on Bzaro.";
