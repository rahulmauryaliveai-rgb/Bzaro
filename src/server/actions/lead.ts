"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSeller } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { closeLeadSchema, flagLeadSchema, leadIdSchema } from "@/lib/validation/lead";
import {
  acceptLead,
  closeLead,
  flagLead,
  setLeadOutcome,
} from "@/server/services/lead-inbox.service";

/**
 * Seller-side lead actions (docs/LEADS.md §2, §4).
 *
 * The tenant comes from the session via `requireSeller()`, never from the
 * form; the service scopes every write by that sellerId, so a forged lead id
 * matches nothing. Permissions are checked per action — accepting spends a
 * credit and is gated separately from reading.
 */

export type AcceptLeadState = {
  ok?: boolean;
  error?: string;
  balanceAfter?: number;
};

export async function acceptLeadAction(
  _previous: AcceptLeadState,
  formData: FormData,
): Promise<AcceptLeadState> {
  const scope = await requireSeller();
  if (!can(scope.role, "lead:accept")) return { error: "You can't accept leads on this account." };

  const parsed = leadIdSchema.safeParse({ leadId: formData.get("leadId") });
  if (!parsed.success) return { error: "Something went wrong. Please try again." };

  const result = await acceptLead({
    sellerId: scope.sellerId,
    leadId: parsed.data.leadId,
    actorId: scope.userId,
  });

  if (!result.ok) {
    const copy: Record<typeof result.reason, string> = {
      not_found: "This lead is no longer available.",
      not_market: "Direct enquiries are already unlocked — no credit needed.",
      not_open: "This lead has already been accepted or closed.",
      expired: "This lead has expired.",
      insufficient_credits:
        "You're out of credits. Upgrade your plan or wait for next month's grant.",
    };
    return { error: copy[result.reason] };
  }

  revalidatePath("/dashboard/leads");
  revalidatePath(`/dashboard/leads/${parsed.data.leadId}`);
  revalidatePath("/dashboard/credits");
  return { ok: true, balanceAfter: result.balanceAfter };
}

export async function closeLeadAction(formData: FormData): Promise<void> {
  const scope = await requireSeller();
  if (!can(scope.role, "lead:manage")) return;

  const parsed = closeLeadSchema.safeParse({
    leadId: formData.get("leadId"),
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) return;

  await closeLead(scope.sellerId, parsed.data.leadId, parsed.data.note);

  revalidatePath("/dashboard/leads");
  revalidatePath(`/dashboard/leads/${parsed.data.leadId}`);
}

export type FlagLeadState = { ok?: boolean; error?: string };

export async function flagLeadAction(
  _previous: FlagLeadState,
  formData: FormData,
): Promise<FlagLeadState> {
  const scope = await requireSeller();
  if (!can(scope.role, "lead:manage")) return { error: "You can't flag leads on this account." };

  const parsed = flagLeadSchema.safeParse({
    leadId: formData.get("leadId"),
    reason: formData.get("reason"),
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) return { error: "Choose a reason." };

  const result = await flagLead({
    sellerId: scope.sellerId,
    leadId: parsed.data.leadId,
    reason: parsed.data.reason,
    note: parsed.data.note,
  });

  if (!result.ok) {
    const copy: Record<typeof result.reason, string> = {
      not_found: "This lead is no longer available.",
      already_flagged: "You've already flagged this lead. We'll review it shortly.",
      not_flaggable: "Open the lead before flagging it.",
    };
    return { error: copy[result.reason] };
  }

  revalidatePath(`/dashboard/leads/${parsed.data.leadId}`);
  return { ok: true };
}

export async function setLeadOutcomeAction(formData: FormData): Promise<void> {
  const scope = await requireSeller();
  if (!can(scope.role, "lead:manage")) return;

  const parsed = z
    .object({
      leadId: z.string().cuid(),
      status: z.enum(["CONTACTED", "WON", "LOST"]),
      note: z.string().trim().max(1000).optional(),
    })
    .safeParse({
      leadId: formData.get("leadId"),
      status: formData.get("status"),
      note: formData.get("note") || undefined,
    });
  if (!parsed.success) return;

  await setLeadOutcome(scope.sellerId, parsed.data.leadId, parsed.data.status, parsed.data.note);

  revalidatePath("/dashboard/leads");
  revalidatePath(`/dashboard/leads/${parsed.data.leadId}`);
}
