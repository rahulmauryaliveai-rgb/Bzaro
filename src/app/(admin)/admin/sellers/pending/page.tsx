import { redirect } from "next/navigation";

/**
 * Pending verification queue.
 *
 * A filtered view of the seller list rather than a separate implementation —
 * two code paths listing sellers would drift, and the reviewer needs the same
 * columns either way.
 */
export default function PendingSellersPage() {
  redirect("/admin/sellers?status=PENDING_VERIFICATION");
}
