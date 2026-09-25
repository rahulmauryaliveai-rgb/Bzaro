import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/guards";
import { safeNextPath } from "@/lib/buyer/guard";
import { BuyerSignIn } from "@/components/account/BuyerSignIn";

export const metadata: Metadata = {
  title: "Buyer sign in",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ next?: string; view?: string }> };

/** Buyer sign-in / sign-up — the page version of the popup. Sellers use /login. */
export default async function BuyerSignInPage({ searchParams }: Props) {
  const { next, view } = await searchParams;
  const destination = safeNextPath(next);
  if (await getSessionUser()) redirect(destination);

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold tracking-tight">Your Bzaro buyer account</h1>
        <p className="mb-6 text-sm text-neutral-600">
          Track your requirements and reach the suppliers who respond.
        </p>
        <BuyerSignIn next={destination} initialView={view === "signup" ? "signup" : "login"} />
      </div>
      <p className="mt-4 text-center text-sm text-neutral-600">
        Selling on Bzaro?{" "}
        <Link href="/login" className="text-brand-700 font-medium hover:underline">
          Seller login
        </Link>
      </p>
    </div>
  );
}
