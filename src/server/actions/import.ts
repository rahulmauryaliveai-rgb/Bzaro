"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSeller } from "@/lib/auth/guards";
import { discardBatch, readBatch } from "@/lib/import/store";
import { runImport } from "@/server/services/import.service";
import { publishProducts } from "@/server/services/publish.service";

/**
 * Bulk upload actions (D49).
 *
 * Every one re-authorises with `requireSeller()` — a Server Action is a POST
 * endpoint and the page guard that "protects" it never runs for a crafted
 * request. No action here takes a seller id, so nothing in a form can point an
 * import at another business.
 *
 * The batch id IS taken from the form, which is unavoidable. It is made safe
 * the same way catalogue item ids are: `readBatch` namespaces the key by the
 * signed-in seller, so another seller's batch id simply does not resolve.
 */

export type ImportActionState = {
  error?: string;
  message?: string;
};

/**
 * Write a previewed batch.
 *
 * Takes nothing but the batch id. The rows come from the server-side staged
 * copy, so nothing the browser sends can change what gets written — see
 * lib/import/store for why that matters more than the convenience does.
 */
export async function commitImportAction(
  _previous: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const scope = await requireSeller();

  const batchId = String(formData.get("batch") ?? "").trim();
  if (!batchId) return { error: "Nothing to import." };

  const batch = await readBatch(scope.sellerId, batchId);

  if (!batch) {
    return {
      error:
        "This upload has expired, so nothing was imported. Upload your file again — it only takes a moment.",
    };
  }

  const outcome = await runImport({
    sellerId: scope.sellerId,
    sellerSlug: scope.sellerSlug,
    batch,
  });

  if ("alreadyRunning" in outcome) {
    // The seller pressed Import twice. Saying "already running" rather than
    // showing an error is the honest answer: their first press worked.
    return { message: "This import is already running. Give it a moment." };
  }

  // Dropped so the batch cannot be replayed, and so "Download error report"
  // stops being offered for an import that is done.
  await discardBatch(scope.sellerId, batchId);

  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/products/import");
  revalidatePath("/dashboard");

  redirect(`/dashboard/products?imported=${outcome.created}&updated=${outcome.updated}`);
}

/**
 * Publish the selected products from the list.
 *
 * Only products that are ready — a category and at least one photograph — are
 * published; the rest are reported back by name. The check is in the service
 * so it cannot be bypassed by posting ids directly.
 */
export async function publishSelectedAction(
  _previous: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const scope = await requireSeller();

  const ids = formData
    .getAll("productId")
    .map((value) => String(value).trim())
    .filter(Boolean)
    // A bounded list: this comes from checkboxes on a page, and an unbounded
    // id array would be an easy way to make one request do a lot of work.
    .slice(0, 500);

  if (ids.length === 0) return { error: "Tick the products you want to publish." };

  const result = await publishProducts({
    sellerId: scope.sellerId,
    sellerSlug: scope.sellerSlug,
    productIds: ids,
  });

  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard");

  if (result.published === 0) {
    return { error: result.message };
  }

  return { message: result.message };
}
