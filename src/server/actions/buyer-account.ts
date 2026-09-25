"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { signOut } from "@/lib/auth/config";
import { getSessionUser } from "@/lib/auth/guards";
import {
  closeBuyerRequirement,
  deleteBuyerAccount,
  updateBuyerProfile,
} from "@/server/services/buyer-account.service";

/**
 * Buyer account actions. Each one authorises itself from the session and
 * scopes every write to that user — a Server Action is a public POST endpoint.
 */

export type AccountFormState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

const idSchema = z.string().min(1).max(64);

export async function closeRequirementAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  const parsed = idSchema.safeParse(formData.get("requirementId"));
  if (!parsed.success) return;

  await closeBuyerRequirement(user.id, parsed.data);
  revalidatePath(`/account/requirements/${parsed.data}`);
  revalidatePath("/account/requirements");
  revalidatePath("/account");
}

const profileSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name.").max(120),
  locationId: z.string().max(64).optional(),
  notifyOnResponse: z.boolean(),
});

export async function updateBuyerProfileAction(
  _previous: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const user = await getSessionUser();
  if (!user) return { error: "Please sign in again." };

  const parsed = profileSchema.safeParse({
    name: formData.get("name") ?? "",
    locationId: (formData.get("locationId") as string | null) || undefined,
    notifyOnResponse: formData.get("notifyOnResponse") === "on",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  let locationId: string | null = null;
  if (parsed.data.locationId) {
    const location = await db.location.findUnique({
      where: { id: parsed.data.locationId },
      select: { id: true },
    });
    if (!location) return { fieldErrors: { locationId: "Choose a city from the list." } };
    locationId = location.id;
  }

  await updateBuyerProfile(user.id, {
    name: parsed.data.name,
    locationId,
    notifyOnResponse: parsed.data.notifyOnResponse,
  });
  revalidatePath("/account", "layout");
  return { ok: true };
}

export async function deleteBuyerAccountAction(
  _previous: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const user = await getSessionUser();
  if (!user) return { error: "Please sign in again." };
  if (
    String(formData.get("confirm") ?? "")
      .trim()
      .toUpperCase() !== "DELETE"
  ) {
    return { fieldErrors: { confirm: "Type DELETE to confirm." } };
  }

  const result = await deleteBuyerAccount(user.id);
  if (!result.ok) {
    return {
      error:
        "Seller and admin accounts can't be deleted here. Please email us and we'll help you close your business account.",
    };
  }

  await signOut({ redirect: false });
  redirect("/?account=deleted");
}
