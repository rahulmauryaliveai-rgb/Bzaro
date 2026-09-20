import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser, getActiveSeller } from "@/lib/auth/guards";
import { isPlatformStaff } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { getOnboardingOptions } from "@/server/services/seller.service";
import { getOnboardingStep, stepPath } from "@/server/services/onboarding.service";
import { BusinessRegistrationForm } from "@/components/dashboard/BusinessRegistrationForm";
import { Stepper } from "@/components/onboarding/Stepper";

export const metadata: Metadata = {
  title: "Register your business",
  robots: { index: false, follow: false },
};

/**
 * Onboarding step 2 of 4: the business.
 *
 * A user who already has a business is sent to wherever their onboarding
 * stopped — the trust step, the catalogue step, or the dashboard — rather
 * than being allowed to create a second one they could not switch between.
 */
export default async function RegisterBusinessPage() {
  const user = await requireUser("/register/business");
  // A platform account is not a seller. Registering a business under it
  // would attach a tenant to the admin; use a separate seller account.
  if (isPlatformStaff(user.role)) redirect("/admin");

  const existing = await getActiveSeller();
  if (existing) redirect(stepPath(await getOnboardingStep(existing.sellerId)));

  const [{ categories, locations }, account] = await Promise.all([
    getOnboardingOptions(),
    db.user.findUnique({ where: { id: user.id }, select: { phone: true } }),
  ]);

  return (
    <div className="w-full max-w-xl rounded-lg border border-neutral-200 bg-white p-6">
      <Stepper current="BUSINESS" />
      <h1 className="mb-1 text-lg font-semibold tracking-tight">Register your business</h1>
      <p className="mb-6 text-sm text-neutral-600">
        This creates your listing, reserves your website address, and decides which buyer
        requirements reach you.
      </p>

      <BusinessRegistrationForm
        categories={categories}
        locations={locations}
        defaultPhone={account?.phone ?? ""}
      />
    </div>
  );
}
