import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { BuyerPhoneForm } from "@/components/buyer/BuyerPhoneForm";

export const metadata: Metadata = {
  title: "Add your number",
  robots: { index: false, follow: false },
};

/**
 * The one-time phone step after a Google sign-in (D35).
 *
 * Google gives us an email and a name, never a number — and a number is the
 * one thing a seller needs to answer a requirement. Asked once, here, and
 * skipped entirely for anyone who already has one, so it can be linked to
 * unconditionally as a post-login destination.
 */
export default async function BuyerPhonePage() {
  const user = await requireUser("/account/phone");

  const row = await db.user.findUnique({
    where: { id: user.id },
    select: { phone: true },
  });

  if (row?.phone) redirect("/account/continue");

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">One last thing</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Sellers call or WhatsApp you on this number when they reply to a requirement. We don&apos;t
        show it publicly.
      </p>

      <div className="mt-6">
        <BuyerPhoneForm />
      </div>
    </div>
  );
}
