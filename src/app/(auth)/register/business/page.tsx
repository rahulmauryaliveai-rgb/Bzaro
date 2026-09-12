import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser, getActiveSeller } from "@/lib/auth/guards";
import { getOnboardingOptions } from "@/server/services/seller.service";
import { BusinessRegistrationForm } from "@/components/dashboard/BusinessRegistrationForm";

export const metadata: Metadata = {
  title: "Register your business",
  robots: { index: false, follow: false },
};

/**
 * Seller onboarding.
 *
 * Reached from `requireSeller()`, which redirects here when a signed-in user
 * has no business yet. Deliberately a separate step from account creation: a
 * person can hold an account without a phantom empty tenant being provisioned,
 * and the schema already supports one person owning several businesses later.
 */
export default async function RegisterBusinessPage() {
  await requireUser("/register/business");

  // Already has a business — send them to the dashboard rather than letting
  // them create a second one they could not switch between.
  const existing = await getActiveSeller();
  if (existing) redirect("/dashboard");

  const { categories, locations } = await getOnboardingOptions();

  return (
    <div className="w-full max-w-xl rounded-lg border border-neutral-200 bg-white p-6">
      <h1 className="mb-1 text-lg font-semibold tracking-tight">Register your business</h1>
      <p className="mb-6 text-sm text-neutral-600">
        This creates your listing and reserves your website address.
      </p>

      <BusinessRegistrationForm categories={categories} locations={locations} />
    </div>
  );
}
