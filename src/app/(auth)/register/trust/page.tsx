import type { Metadata } from "next";
import { requireSeller } from "@/lib/auth/guards";
import { getTrustStepValues } from "@/server/services/onboarding.service";
import { TrustStepForm } from "@/components/onboarding/TrustStepForm";
import { Stepper } from "@/components/onboarding/Stepper";

export const metadata: Metadata = {
  title: "Build trust",
  robots: { index: false, follow: false },
};

/**
 * Onboarding step 3 of 4: what makes a buyer trust the listing. Everything
 * here is optional and revisitable from the profile page — the point is to
 * ask once, at the moment the seller is motivated, without blocking them.
 */
export default async function RegisterTrustPage() {
  const scope = await requireSeller();
  const values = await getTrustStepValues(scope.sellerId);

  return (
    <div className="w-full max-w-xl rounded-lg border border-neutral-200 bg-white p-6">
      <Stepper current="TRUST" />
      <h1 className="mb-1 text-lg font-semibold tracking-tight">Help buyers trust you</h1>
      <p className="mb-6 text-sm text-neutral-600">
        Verified details rank higher in listings and in market-lead matching. Add what you have now;
        the rest can wait.
      </p>
      <TrustStepForm values={values} />
    </div>
  );
}
