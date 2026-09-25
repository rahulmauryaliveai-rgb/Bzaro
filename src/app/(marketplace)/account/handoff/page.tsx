import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireBuyerPage } from "@/lib/buyer/guard";
import { createStoreHandoff, parseStoreTarget } from "@/server/services/handoff.service";

export const metadata: Metadata = {
  title: "Signing you in to the store",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ to?: string; google?: string }> };

/**
 * Apex side of the store sign-in hand-off (see handoff.service.ts). Signs the
 * buyer in on bzaro.in if needed, then sends them back to the store with a
 * one-time token.
 */
export default async function StoreHandoffPage({ searchParams }: Props) {
  const { to, google } = await searchParams;
  const target = parseStoreTarget(to);
  if (!target) redirect("/account");

  const self = `/account/handoff?to=${encodeURIComponent(target.toString())}`;
  const user = await requireBuyerPage(google === "1" ? `${self}&google=1` : self, {
    google: google === "1",
  });

  if (user.role !== "BUYER") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Store sign-in is for buyer accounts</h1>
        <p className="mt-2 text-sm text-neutral-600">
          You&apos;re signed in to Bzaro with a seller or team account. For security, those sessions
          stay on bzaro.in. To shop on a store, sign in there with a buyer account.
        </p>
        <Link
          href={target.toString()}
          className="text-brand-700 mt-4 inline-block text-sm font-medium hover:underline"
        >
          ← Back to the store
        </Link>
      </div>
    );
  }

  redirect(await createStoreHandoff(user.id, target));
}
