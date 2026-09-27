"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission, requireSeller } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { requestCustomDomain, setCustomDomainStatus } from "@/server/services/domain.service";

export type DomainFormState = { ok?: boolean; error?: string };

/** Seller (Gold): ask for a custom domain. The Bzaro team connects it. */
export async function requestCustomDomainAction(
  _prev: DomainFormState,
  formData: FormData,
): Promise<DomainFormState> {
  const scope = await requireSeller();
  if (!can(scope.role, "seller:domain")) return { error: "Only the account owner can do this." };
  const domain = z.string().max(260).safeParse(formData.get("domain"));
  if (!domain.success) return { error: "Enter a domain." };
  const result = await requestCustomDomain({
    sellerId: scope.sellerId,
    userId: scope.userId,
    domain: domain.data,
  });
  revalidatePath("/dashboard/website");
  return result.ok ? { ok: true } : { error: result.error };
}

/** Admin: switch a requested domain on (after DNS + TLS) or mark it failed. */
export async function setCustomDomainStatusAction(formData: FormData): Promise<void> {
  const user = await requirePermission("admin:seller:website");
  const parsed = z
    .object({ sellerId: z.string().min(1).max(40), status: z.enum(["ACTIVE", "FAILED", "NONE"]) })
    .safeParse({ sellerId: formData.get("sellerId"), status: formData.get("status") });
  if (!parsed.success) return;
  await setCustomDomainStatus({ ...parsed.data, adminId: user.id });
  revalidatePath(`/admin/sellers/${parsed.data.sellerId}`);
}
