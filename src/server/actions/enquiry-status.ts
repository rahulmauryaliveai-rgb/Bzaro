"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSeller } from "@/lib/auth/guards";
import { updateEnquiryStatus } from "@/server/services/enquiry.service";

/**
 * Update an enquiry's status from the seller inbox.
 *
 * The tenant is taken from the SESSION via `requireSeller()`, never from the
 * form. A caller who supplies someone else's enquiry id simply matches zero
 * rows, because the service scopes its `updateMany` by `sellerId` — so this
 * action cannot touch another tenant's data even with a forged id.
 */

const schema = z.object({
  enquiryId: z.string().cuid(),
  status: z.enum(["VIEWED", "RESPONDED", "CONVERTED", "CLOSED", "SPAM"]),
});

export async function updateEnquiryStatusAction(formData: FormData): Promise<void> {
  // Authorise first, always. This is a POST endpoint reachable directly; the
  // dashboard layout guard does not run for a crafted request.
  const scope = await requireSeller();

  const parsed = schema.safeParse({
    enquiryId: formData.get("enquiryId"),
    status: formData.get("status"),
  });

  if (!parsed.success) return;

  await updateEnquiryStatus(scope.sellerId, parsed.data.enquiryId, parsed.data.status);

  // The inbox is a private, uncached surface, so a path revalidation is enough
  // — no public cache tags are involved.
  revalidatePath("/dashboard/enquiries");
}
