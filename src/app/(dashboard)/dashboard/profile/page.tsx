import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSeller } from "@/lib/auth/guards";
import { getSellerProfile, getOnboardingOptions } from "@/server/services/seller.service";
import { getIndexEligibilityRules } from "@/server/services/indexability.service";
import { ProfileForm } from "@/components/dashboard/ProfileForm";
import type { SocialLinks } from "@/lib/tenant/context";

export const metadata: Metadata = {
  title: "Business profile",
  robots: { index: false, follow: false },
};

/**
 * Business profile editing.
 *
 * The description threshold is read from the live eligibility rules rather than
 * hardcoded, so the counter in the form always reflects the bar an admin
 * actually set (decision D2) instead of drifting from it.
 */
export default async function ProfilePage() {
  const scope = await requireSeller();

  const [profile, options, rules] = await Promise.all([
    getSellerProfile(scope.sellerId),
    getOnboardingOptions(),
    getIndexEligibilityRules(),
  ]);

  if (!profile) notFound();

  return (
    <div className="max-w-2xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Business profile</h1>
        <p className="mt-1 text-sm text-neutral-600">
          This is what buyers see on your website and across the marketplace.
        </p>
      </header>

      <ProfileForm
        profile={{
          businessName: profile.businessName,
          legalName: profile.legalName,
          tagline: profile.tagline,
          description: profile.description,
          email: profile.email,
          phone: profile.phone,
          whatsapp: profile.whatsapp,
          websiteUrl: profile.websiteUrl,
          logoUrl: profile.logoUrl,
          coverImageUrl: profile.coverImageUrl,
          addressLine1: profile.addressLine1,
          addressLine2: profile.addressLine2,
          postalCode: profile.postalCode,
          locationId: profile.locationId,
          establishedYear: profile.establishedYear,
          businessType: profile.businessType,
          annualTurnover: profile.annualTurnover,
          certifications: profile.certifications,
          servesLocationIds: profile.serviceAreas.map((area) => area.locationId),
          employeeCount: profile.employeeCount,
          gstin: profile.gstin,
          socialLinks: (profile.socialLinks as SocialLinks | null) ?? {},
        }}
        locations={options.locations}
        minDescriptionLength={rules.minDescriptionLength}
      />
    </div>
  );
}
