import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { ContinueAfterSignIn } from "@/components/buyer/ContinueAfterSignIn";

export const metadata: Metadata = {
  title: "Signing you in",
  robots: { index: false, follow: false },
};

/**
 * Where a buyer lands after "Continue with Google".
 *
 * No phone yet → the one-time phone step, which comes back here. With a phone,
 * the browser decides the rest: a requirement left unsent before the Google
 * round-trip (kept in sessionStorage, which the server cannot see) is offered
 * back on /post-requirement; otherwise the buyer goes to their requirements.
 */
export default async function ContinueAfterSignInPage() {
  const user = await requireUser("/account/continue");

  const row = await db.user.findUnique({
    where: { id: user.id },
    select: { phone: true },
  });
  if (!row?.phone) redirect("/account/phone");

  return <ContinueAfterSignIn />;
}
