"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { isPlatformStaff } from "@/lib/auth/permissions";
import { GSTIN_TAKEN, isUniqueViolation } from "@/lib/db-errors";
import { requireSeller, requireUserStrict } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { businessStepSchema } from "@/lib/validation/onboarding";
import {
  sellerProfileSchema,
  slugChangeSchema,
  websiteSettingsSchema,
} from "@/lib/validation/seller";
import {
  applyTemplate,
  changeSlug,
  checkSlugAvailability,
  createSeller,
  publishWebsite,
  unpublishWebsite,
  updateSellerProfile,
  updateWebsiteSettings,
} from "@/server/services/seller.service";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";

/**
 * Seller Server Actions.
 *
 * Every one authorises from scratch via `requireSeller()`, which reads
 * membership from the database rather than the token. The tenant is therefore
 * never taken from the form — a caller cannot act on a business they do not own
 * by supplying its id, because no action accepts one.
 */

export type SellerActionState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  message?: string;
};

function fieldErrorsFrom(issues: Array<{ path: PropertyKey[]; message: string }>) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

/**
 * Live slug availability, called as the seller types.
 *
 * Rate limited despite being a read: it is an unauthenticated-ish enumeration
 * surface — without a limit it lets anyone dump which subdomains exist, one
 * request at a time.
 */
export async function checkSlugAction(slug: string): Promise<{
  available: boolean;
  reason?: string;
}> {
  await requireUserStrict();

  if (!slug || slug.length > 63) return { available: false, reason: "Enter an address." };

  const limit = await checkRateLimit("search", getClientIp(await headers()));
  if (!limit.success) return { available: false, reason: "Slow down a moment." };

  const result = await checkSlugAvailability(slug);
  return result.available ? { available: true } : { available: false, reason: result.reason };
}

export async function registerBusinessAction(
  _previous: SellerActionState,
  formData: FormData,
): Promise<SellerActionState> {
  const user = await requireUserStrict();
  if (isPlatformStaff(user.role)) {
    return { error: "Staff accounts cannot register a business. Use a separate seller account." };
  }

  const parsed = businessStepSchema.safeParse({
    businessName: formData.get("businessName"),
    slug: formData.get("slug"),
    businessType: formData.get("businessType"),
    phone: formData.get("phone"),
    addressLine1: formData.get("addressLine1"),
    postalCode: formData.get("postalCode"),
    locationId: formData.get("locationId"),
    primaryCategoryId: formData.get("primaryCategoryId"),
    secondaryCategoryIds: formData.getAll("secondaryCategoryIds").map(String).filter(Boolean),
    servesLocationIds: formData.getAll("servesLocationIds").map(String).filter(Boolean),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const limit = await checkRateLimit("register", getClientIp(await headers()));
  if (!limit.success) {
    return { error: "Too many attempts. Try again shortly." };
  }

  const account = await db.user.findUnique({
    where: { id: user.id },
    select: { whatsapp: true },
  });

  const result = await createSeller({
    userId: user.id,
    userEmail: user.email,
    userWhatsapp: account?.whatsapp ?? null,
    input: parsed.data,
  });

  if (!result.ok) {
    return result.reason === "slug_taken"
      ? { fieldErrors: { slug: result.message } }
      : { error: result.message };
  }

  // Redirect must be outside the try/catch of the caller: Next signals it by
  // throwing, and swallowing that would leave the seller on a dead form.
  redirect("/register/trust");
}

export async function updateProfileAction(
  _previous: SellerActionState,
  formData: FormData,
): Promise<SellerActionState> {
  const scope = await requireSeller();

  const raw = Object.fromEntries(
    [
      "businessName",
      "legalName",
      "tagline",
      "description",
      "email",
      "phone",
      "whatsapp",
      "websiteUrl",
      "addressLine1",
      "addressLine2",
      "postalCode",
      "locationId",
      "establishedYear",
      "employeeCount",
      "businessType",
      "annualTurnover",
      "gstin",
      "logoUrl",
      "coverImageUrl",
      "facebook",
      "instagram",
      "linkedin",
      "youtube",
      "x",
    ].map((key) => [key, formData.get(key) ?? ""]),
  );

  const parsed = sellerProfileSchema.safeParse({
    ...raw,
    certifications: formData.getAll("certifications").map(String).filter(Boolean),
    servesLocationIds: formData.getAll("servesLocationIds").map(String).filter(Boolean),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  try {
    await updateSellerProfile(scope.sellerId, scope.sellerSlug, parsed.data);
  } catch (error) {
    if (isUniqueViolation(error, "Seller", "gstin")) {
      return { fieldErrors: { gstin: GSTIN_TAKEN } };
    }
    throw error;
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/profile");

  return { ok: true, message: "Profile saved." };
}

export async function updateWebsiteAction(
  _previous: SellerActionState,
  formData: FormData,
): Promise<SellerActionState> {
  const scope = await requireSeller();

  const parsed = websiteSettingsSchema.safeParse({
    templateKey: formData.get("templateKey"),
    primary: formData.get("primary"),
    accent: formData.get("accent"),
    background: formData.get("background"),
    foreground: formData.get("foreground"),
    surface: formData.get("surface"),
    border: formData.get("border"),
    fontPair: formData.get("fontPair"),
    radius: formData.get("radius"),
    headerVariant: formData.get("headerVariant"),
    heroVariant: formData.get("heroVariant"),
    metaTitle: formData.get("metaTitle") ?? "",
    metaDescription: formData.get("metaDescription") ?? "",
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  await updateWebsiteSettings(scope.sellerId, scope.sellerSlug, {
    templateKey: parsed.data.templateKey,
    tokens: {
      primary: parsed.data.primary,
      accent: parsed.data.accent,
      background: parsed.data.background,
      foreground: parsed.data.foreground,
      surface: parsed.data.surface,
      border: parsed.data.border,
      fontPair: parsed.data.fontPair,
      radius: parsed.data.radius,
      headerVariant: parsed.data.headerVariant,
      heroVariant: parsed.data.heroVariant,
      showPlatformBranding: true,
    },
    metaTitle: parsed.data.metaTitle,
    metaDescription: parsed.data.metaDescription,
  });

  revalidatePath("/dashboard/website");

  return { ok: true, message: "Website settings saved." };
}

/** Dashboard template picker (D33): apply a template's preset and layout. */
export async function chooseTemplateAction(formData: FormData): Promise<void> {
  const scope = await requireSeller();
  const key = formData.get("templateKey");
  if (typeof key !== "string" || !key) return;
  await applyTemplate(scope.sellerId, scope.sellerSlug, key);
  revalidatePath("/dashboard/website");
}

export async function publishWebsiteAction(formData: FormData): Promise<void> {
  const scope = await requireSeller();
  const publish = formData.get("publish") === "1";

  if (publish) {
    await publishWebsite(scope.sellerId, scope.sellerSlug);
  } else {
    await unpublishWebsite(scope.sellerId, scope.sellerSlug);
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/website");
}

export async function changeSlugAction(
  _previous: SellerActionState,
  formData: FormData,
): Promise<SellerActionState> {
  const scope = await requireSeller();

  const parsed = slugChangeSchema.safeParse({
    slug: formData.get("slug"),
    confirm: formData.get("confirm"),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  if (parsed.data.slug === scope.sellerSlug) {
    return { fieldErrors: { slug: "That is already your web address." } };
  }

  const result = await changeSlug(scope.sellerId, scope.sellerSlug, parsed.data.slug);

  if (!result.ok) return { fieldErrors: { slug: result.reason } };

  revalidatePath("/dashboard/website");

  return {
    ok: true,
    message: `Your web address is now ${result.slug}. The old address will redirect here permanently.`,
  };
}
