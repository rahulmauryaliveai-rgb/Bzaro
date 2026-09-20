import "server-only";
import { db } from "@/lib/db";
import { computeCompletion, type CompletionResult } from "@/lib/onboarding/completion";
import { applyTemplate } from "@/server/services/seller.service";
import { revalidateTenant } from "@/lib/cache/revalidate";
import { recomputeIndexability } from "@/server/services/indexability.service";
import { revalidateSellerDiscovery } from "@/server/services/discovery.service";
import type { TrustStepInput } from "@/lib/validation/onboarding";
import type { OnboardingStep } from "@/generated/prisma/enums";

/**
 * Onboarding steps 3 and 4, and the profile-completion read.
 *
 * Steps 1 and 2 create rows (auth.service.registerUser, seller.service
 * .createSeller); these two only update the seller that step 2 created.
 * `onboardingStep` is the resume pointer: the register pages send a seller to
 * whichever step it names, and the dashboard shows "continue setup" until it
 * reaches COMPLETE.
 */

export const STEP_ORDER: OnboardingStep[] = [
  "ACCOUNT",
  "BUSINESS",
  "TRUST",
  "THEME",
  "CATALOG",
  "COMPLETE",
];

/** Where an onboarding step lives. */
export function stepPath(step: OnboardingStep): string {
  switch (step) {
    case "ACCOUNT":
      return "/register";
    case "BUSINESS":
      return "/register/business";
    case "TRUST":
      return "/register/trust";
    case "THEME":
      return "/register/theme";
    case "CATALOG":
      return "/register/catalog";
    case "COMPLETE":
      return "/dashboard";
  }
}

export async function getOnboardingStep(sellerId: string): Promise<OnboardingStep> {
  const seller = await db.seller.findUnique({
    where: { id: sellerId },
    select: { onboardingStep: true },
  });
  return seller?.onboardingStep ?? "COMPLETE";
}

/** Step 3. Every field optional — "skip" is the same call with nothing set. */
export async function saveTrustStep(
  sellerId: string,
  slug: string,
  input: Partial<TrustStepInput>,
): Promise<void> {
  await db.seller.update({
    where: { id: sellerId },
    data: {
      ...(input.gstin !== undefined ? { gstin: input.gstin } : {}),
      ...(input.establishedYear !== undefined ? { establishedYear: input.establishedYear } : {}),
      ...(input.employeeCount !== undefined ? { employeeCount: input.employeeCount } : {}),
      ...(input.annualTurnover !== undefined ? { annualTurnover: input.annualTurnover } : {}),
      ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
      ...(input.certifications !== undefined ? { certifications: input.certifications } : {}),
      onboardingStep: "THEME",
    },
  });

  await recomputeIndexability(sellerId);
  revalidateTenant(slug);
}

/**
 * Step 4 (D33): apply a website template and move on. The template's preset
 * tokens become the site's tokens — the seller tunes colours later from the
 * dashboard. Choosing nothing keeps the default and still advances.
 */
export async function saveThemeStep(
  sellerId: string,
  slug: string,
  templateKey: string | null,
): Promise<void> {
  if (templateKey) await applyTemplate(sellerId, slug, templateKey);
  await db.seller.update({ where: { id: sellerId }, data: { onboardingStep: "CATALOG" } });
}

/** Step 4: onboarding is done whichever way the seller leaves it. */
export async function completeOnboarding(sellerId: string): Promise<void> {
  await db.seller.update({
    where: { id: sellerId },
    data: { onboardingStep: "COMPLETE" },
  });
  await revalidateSellerDiscovery(sellerId);
}

/** The trust-step form's initial values. */
export async function getTrustStepValues(sellerId: string) {
  return db.seller.findUnique({
    where: { id: sellerId },
    select: {
      businessName: true,
      gstin: true,
      establishedYear: true,
      employeeCount: true,
      annualTurnover: true,
      logoUrl: true,
      certifications: true,
    },
  });
}

/** Profile completion for the dashboard bar. */
export async function getProfileCompletion(sellerId: string): Promise<{
  completion: CompletionResult;
  onboardingStep: OnboardingStep;
} | null> {
  const seller = await db.seller.findUnique({
    where: { id: sellerId },
    select: {
      businessName: true,
      description: true,
      logoUrl: true,
      coverImageUrl: true,
      businessType: true,
      addressLine1: true,
      postalCode: true,
      locationId: true,
      phone: true,
      whatsapp: true,
      gstin: true,
      establishedYear: true,
      employeeCount: true,
      annualTurnover: true,
      certifications: true,
      onboardingStep: true,
      website: { select: { publishedAt: true } },
      members: {
        where: { role: "SELLER_OWNER" },
        take: 1,
        select: { user: { select: { phoneVerified: true } } },
      },
      _count: {
        select: {
          categories: true,
          serviceAreas: true,
          products: {
            where: { status: "PUBLISHED", deletedAt: null, moderationStatus: "APPROVED" },
          },
          gallery: { where: { deletedAt: null } },
        },
      },
    },
  });
  if (!seller) return null;

  const completion = computeCompletion({
    businessName: seller.businessName,
    description: seller.description,
    logoUrl: seller.logoUrl,
    coverImageUrl: seller.coverImageUrl,
    businessType: seller.businessType,
    addressLine1: seller.addressLine1,
    postalCode: seller.postalCode,
    locationId: seller.locationId,
    phone: seller.phone,
    whatsapp: seller.whatsapp,
    phoneVerified: Boolean(seller.members[0]?.user.phoneVerified),
    gstin: seller.gstin,
    establishedYear: seller.establishedYear,
    employeeCount: seller.employeeCount,
    annualTurnover: seller.annualTurnover,
    certifications: seller.certifications,
    categoryCount: seller._count.categories,
    serviceAreaCount: seller._count.serviceAreas,
    publishedProducts: seller._count.products,
    galleryItems: seller._count.gallery,
    websitePublished: seller.website?.publishedAt !== null && seller.website !== null,
  });

  return { completion, onboardingStep: seller.onboardingStep };
}

/** Mark the owner's phone verified after an OTP (dashboard settings, or step 1 later). */
export async function markUserPhoneVerified(userId: string, phone: string): Promise<boolean> {
  const taken = await db.user.findFirst({
    where: { phone, id: { not: userId } },
    select: { id: true },
  });
  if (taken) return false;

  await db.user.update({
    where: { id: userId },
    data: { phone, phoneVerified: new Date() },
  });
  return true;
}
