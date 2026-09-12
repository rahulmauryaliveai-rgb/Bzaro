import "server-only";
import { db } from "@/lib/db";
import { checkSlug } from "@/lib/tenant/reserved";
import { revalidateTenant } from "@/lib/cache/revalidate";
import { recomputeIndexability } from "@/server/services/indexability.service";
import { defaultThemeTokens, themeTokensSchema } from "@/lib/validation/theme";
import { SLUG_CHANGE_COOLDOWN_DAYS } from "@/lib/validation/seller";
import { DEFAULT_TEMPLATE_KEY, isKnownTemplate } from "@/components/site/templates/registry";
import { mailer } from "@/lib/mail";
import { sellerWelcomeEmail } from "@/lib/mail/templates";
import { marketplaceUrl, tenantUrl } from "@/lib/utils/url";
import type { BusinessRegistrationInput, SellerProfileInput } from "@/lib/validation/seller";

/**
 * Seller lifecycle: registration, profile, website settings.
 *
 * ── Every profile write recomputes indexability ──────────────────────────────
 * `SellerWebsite.indexable` is derived and persisted (decision D2), so a write
 * that changes the description, logo, address or contact details can flip it in
 * either direction. Recomputing here — rather than leaving it to the nightly
 * job — is what makes the dashboard checklist update the moment a seller fixes
 * something, instead of tomorrow.
 */

export type SlugAvailability =
  | { available: true }
  | { available: false; reason: string };

/**
 * Is a subdomain free?
 *
 * Three checks, in cost order: format and reserved words (free), then the
 * sellers table, then retired slugs. Retired slugs stay claimed forever
 * (decision D11) — reclaiming one would let a new seller inherit another
 * business's inbound links and reputation, which is an impersonation risk, not
 * just a redirect bug.
 */
export async function checkSlugAvailability(raw: string): Promise<SlugAvailability> {
  const slug = raw.trim().toLowerCase();

  const format = checkSlug(slug);
  if (!format.ok) return { available: false, reason: format.message };

  const [existing, retired] = await Promise.all([
    db.seller.findUnique({ where: { slug }, select: { id: true } }),
    db.sellerSlugHistory.findUnique({ where: { slug }, select: { id: true } }),
  ]);

  if (existing) return { available: false, reason: "That address is already taken." };
  if (retired) {
    return {
      available: false,
      reason: "That address was previously used by another business.",
    };
  }

  return { available: true };
}

export type CreateSellerResult =
  | { ok: true; sellerId: string; slug: string }
  | { ok: false; reason: "slug_taken" | "already_owner"; message: string };

/**
 * Provision a seller.
 *
 * One transaction creating five rows: `Seller`, `SellerWebsite`,
 * `SellerMember`, `SellerCategory` rows, and a free `Subscription`.
 *
 * The transaction matters. A half-provisioned seller — a `Seller` with no
 * `SellerWebsite` — would resolve to a tenant whose template lookup fails on
 * every request, and the seller could neither use it nor delete it. All five
 * rows, or none.
 *
 * The new seller starts `PENDING_VERIFICATION`, so their subdomain does NOT yet
 * resolve publicly. That is deliberate: tenant resolution only returns VERIFIED
 * sellers, which prevents an unverified business from putting a live page on the
 * platform's domain before a human has looked at it.
 */
export async function createSeller(params: {
  userId: string;
  input: BusinessRegistrationInput;
  userEmail: string;
}): Promise<CreateSellerResult> {
  const availability = await checkSlugAvailability(params.input.slug);
  if (!availability.available) {
    return { ok: false, reason: "slug_taken", message: availability.reason };
  }

  // One business per account for now. The schema supports many (SellerMember is
  // a join table), but multi-business onboarding needs a tenant switcher in the
  // dashboard that does not exist yet — so allowing it would create sellers the
  // owner could not reach.
  const existingMembership = await db.sellerMember.findFirst({
    where: { userId: params.userId, seller: { deletedAt: null } },
    select: { id: true },
  });

  if (existingMembership) {
    return {
      ok: false,
      reason: "already_owner",
      message: "This account already has a business registered.",
    };
  }

  const [template, freePlan] = await Promise.all([
    db.websiteTemplate.findFirst({
      where: { key: DEFAULT_TEMPLATE_KEY },
      select: { id: true },
    }),
    db.plan.findUnique({ where: { key: "free" }, select: { id: true } }),
  ]);

  if (!template) {
    throw new Error(
      `Default website template "${DEFAULT_TEMPLATE_KEY}" is missing. Run the seed.`,
    );
  }

  const now = new Date();

  const seller = await db.$transaction(async (tx) => {
    const created = await tx.seller.create({
      data: {
        slug: params.input.slug,
        businessName: params.input.businessName,
        phone: params.input.phone,
        whatsapp: params.input.phone,
        email: params.userEmail,
        locationId: params.input.locationId,
        status: "PENDING_VERIFICATION",
        timezone: "Asia/Kolkata",
      },
      select: { id: true, slug: true },
    });

    await tx.sellerWebsite.create({
      data: {
        sellerId: created.id,
        templateId: template.id,
        themeTokens: defaultThemeTokens,
        // Not published and not indexable. The seller publishes when ready, and
        // the D2 gate decides indexability from there.
        indexable: false,
        indexBlockReason: "not_published",
      },
    });

    await tx.sellerMember.create({
      data: { userId: params.userId, sellerId: created.id, role: "SELLER_OWNER" },
    });

    await tx.sellerCategory.createMany({
      data: params.input.categoryIds.map((categoryId, index) => ({
        sellerId: created.id,
        categoryId,
        isPrimary: index === 0,
      })),
    });

    if (freePlan) {
      await tx.subscription.create({
        data: {
          sellerId: created.id,
          planId: freePlan.id,
          status: "ACTIVE",
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 3600 * 1000),
        },
      });
    }

    await tx.user.update({
      where: { id: params.userId },
      data: { role: "SELLER_OWNER" },
    });

    await tx.auditLog.create({
      data: {
        actorId: params.userId,
        sellerId: created.id,
        action: "seller.register",
        after: { slug: created.slug, businessName: params.input.businessName },
      },
    });

    return created;
  });

  await mailer.send(
    sellerWelcomeEmail({
      to: params.userEmail,
      businessName: params.input.businessName,
      siteUrl: tenantUrl(seller.slug),
      dashboardUrl: marketplaceUrl("/dashboard"),
    }),
  );

  return { ok: true, sellerId: seller.id, slug: seller.slug };
}

/** Business profile for the dashboard edit form. */
export function getSellerProfile(sellerId: string) {
  return db.seller.findUnique({
    where: { id: sellerId },
    select: {
      id: true,
      slug: true,
      businessName: true,
      legalName: true,
      tagline: true,
      description: true,
      status: true,
      email: true,
      phone: true,
      whatsapp: true,
      websiteUrl: true,
      logoUrl: true,
      coverImageUrl: true,
      addressLine1: true,
      addressLine2: true,
      postalCode: true,
      locationId: true,
      establishedYear: true,
      employeeCount: true,
      gstin: true,
      socialLinks: true,
      profileScore: true,
      slugHistory: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
      website: {
        select: {
          templateId: true,
          themeTokens: true,
          metaTitle: true,
          metaDescription: true,
          indexable: true,
          indexBlockReason: true,
          publishedAt: true,
          template: { select: { key: true } },
        },
      },
    },
  });
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

/** Save the business profile, then re-evaluate the D2 gate. */
export async function updateSellerProfile(
  sellerId: string,
  slug: string,
  input: SellerProfileInput,
): Promise<void> {
  const socialLinks: Record<string, string> = {};
  for (const key of ["facebook", "instagram", "linkedin", "youtube", "x"] as const) {
    const value = emptyToNull(input[key]);
    if (value) socialLinks[key] = value;
  }

  await db.seller.update({
    where: { id: sellerId },
    data: {
      businessName: input.businessName,
      legalName: emptyToNull(input.legalName),
      tagline: emptyToNull(input.tagline),
      description: emptyToNull(input.description),
      email: emptyToNull(input.email),
      phone: emptyToNull(input.phone),
      whatsapp: emptyToNull(input.whatsapp),
      websiteUrl: emptyToNull(input.websiteUrl),
      logoUrl: emptyToNull(input.logoUrl),
      coverImageUrl: emptyToNull(input.coverImageUrl),
      addressLine1: emptyToNull(input.addressLine1),
      addressLine2: emptyToNull(input.addressLine2),
      postalCode: emptyToNull(input.postalCode),
      locationId: emptyToNull(input.locationId),
      establishedYear: input.establishedYear ?? null,
      employeeCount: emptyToNull(input.employeeCount),
      gstin: emptyToNull(input.gstin),
      socialLinks,
    },
  });

  // Order matters: recompute first so the cache is invalidated with the new
  // indexability already persisted, then revalidate. The reverse order would
  // serve one request with stale robots headers.
  await recomputeIndexability(sellerId);
  revalidateTenant(slug);
}

/** Save website settings. Theme tokens are validated, never trusted. */
export async function updateWebsiteSettings(
  sellerId: string,
  slug: string,
  input: {
    templateKey: string;
    tokens: Record<string, unknown>;
    metaTitle?: string;
    metaDescription?: string;
  },
): Promise<void> {
  const templateKey = isKnownTemplate(input.templateKey)
    ? input.templateKey
    : DEFAULT_TEMPLATE_KEY;

  const template = await db.websiteTemplate.findFirst({
    where: { key: templateKey },
    select: { id: true },
  });

  if (!template) throw new Error(`Template "${templateKey}" is not registered.`);

  // Parsed, not trusted: these values become CSS custom properties, and the
  // schema constrains every one to a hex colour or a fixed enum member.
  const tokens = themeTokensSchema.parse(input.tokens);

  await db.sellerWebsite.update({
    where: { sellerId },
    data: {
      templateId: template.id,
      themeTokens: tokens,
      metaTitle: emptyToNull(input.metaTitle),
      metaDescription: emptyToNull(input.metaDescription),
    },
  });

  revalidateTenant(slug);
}

/**
 * Publish the website.
 *
 * Publishing is one of the D2 requirements, so this flips a gate condition and
 * must recompute. It does NOT make the site indexable on its own — the rest of
 * the checklist still applies.
 */
export async function publishWebsite(sellerId: string, slug: string): Promise<void> {
  await db.sellerWebsite.update({
    where: { sellerId },
    data: { publishedAt: new Date() },
  });

  await recomputeIndexability(sellerId);
  revalidateTenant(slug);
}

export async function unpublishWebsite(sellerId: string, slug: string): Promise<void> {
  await db.sellerWebsite.update({
    where: { sellerId },
    data: { publishedAt: null },
  });

  await recomputeIndexability(sellerId);
  revalidateTenant(slug);
}

export type SlugChangeResult =
  | { ok: true; slug: string }
  | { ok: false; reason: string };

/**
 * Change a seller's subdomain (decision D11).
 *
 * The old slug is written to `SellerSlugHistory` and never deleted, so the
 * retired address redirects permanently. Rate limited to once per 90 days:
 * every change invalidates printed material and inbound links, and the
 * redirect chain grows with each one.
 */
export async function changeSlug(
  sellerId: string,
  currentSlug: string,
  nextSlug: string,
): Promise<SlugChangeResult> {
  const availability = await checkSlugAvailability(nextSlug);
  if (!availability.available) return { ok: false, reason: availability.reason };

  const lastChange = await db.sellerSlugHistory.findFirst({
    where: { sellerId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (lastChange) {
    const daysSince = (Date.now() - lastChange.createdAt.getTime()) / 86_400_000;
    if (daysSince < SLUG_CHANGE_COOLDOWN_DAYS) {
      const remaining = Math.ceil(SLUG_CHANGE_COOLDOWN_DAYS - daysSince);
      return {
        ok: false,
        reason: `You can change your web address again in ${remaining} day${remaining === 1 ? "" : "s"}.`,
      };
    }
  }

  await db.$transaction([
    // History first: if the update failed after the rename, the old address
    // would resolve to nothing and the seller's inbound links would 404.
    db.sellerSlugHistory.create({ data: { sellerId, slug: currentSlug } }),
    db.seller.update({ where: { id: sellerId }, data: { slug: nextSlug } }),
    db.auditLog.create({
      data: {
        sellerId,
        action: "seller.slug_change",
        before: { slug: currentSlug },
        after: { slug: nextSlug },
      },
    }),
  ]);

  // Both addresses change behaviour: the old one starts redirecting, the new
  // one starts resolving.
  revalidateTenant(currentSlug);
  revalidateTenant(nextSlug);

  return { ok: true, slug: nextSlug };
}

/** Categories and locations for the onboarding and profile pickers. */
export async function getOnboardingOptions() {
  const [categories, locations] = await Promise.all([
    db.category.findMany({
      where: { isActive: true, depth: { lte: 1 } },
      select: { id: true, name: true, depth: true, path: true },
      orderBy: [{ depth: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      take: 200,
    }),
    db.location.findMany({
      where: { isActive: true, type: "CITY" },
      select: { id: true, name: true, parent: { select: { name: true } } },
      orderBy: { name: "asc" },
      take: 500,
    }),
  ]);

  return { categories, locations };
}

/**
 * Everything the dashboard overview needs to evaluate the D2 checklist.
 *
 * Lives here rather than in the page because dashboard route code is barred
 * from importing the unscoped `db` client (see eslint.config.mjs). That rule
 * exists to stop cross-tenant queries; the Seller row itself is not
 * tenant-scoped DATA — it IS the tenant — so reading it belongs in a service
 * that takes an already-authorised `sellerId`.
 */
export async function getDashboardSnapshot(sellerId: string) {
  return db.seller.findUnique({
    where: { id: sellerId },
    select: {
      businessName: true,
      status: true,
      description: true,
      logoUrl: true,
      coverImageUrl: true,
      locationId: true,
      addressLine1: true,
      phone: true,
      whatsapp: true,
      email: true,
      verifiedAt: true,
      website: { select: { publishedAt: true, indexable: true } },
      members: {
        where: { role: "SELLER_OWNER" },
        select: { user: { select: { phoneVerified: true } } },
        take: 1,
      },
    },
  });
}

/** Account and verification state for the settings page. */
export async function getAccountSettings(userId: string, sellerId: string) {
  const [seller, account] = await Promise.all([
    db.seller.findUnique({
      where: { id: sellerId },
      select: { status: true, businessName: true, verifiedAt: true },
    }),
    db.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        name: true,
        emailVerified: true,
        phone: true,
        phoneVerified: true,
        // Presence only — the hash itself must never leave the service layer.
        passwordHash: true,
      },
    }),
  ]);

  return {
    seller,
    account: account
      ? {
          email: account.email,
          name: account.name,
          emailVerified: account.emailVerified !== null,
          phone: account.phone,
          phoneVerified: account.phoneVerified !== null,
          hasPassword: account.passwordHash !== null,
        }
      : null,
  };
}

/**
 * Whether the seller may change their subdomain, and when they next can.
 *
 * Computed here rather than in the page so the clock reading happens in a
 * service call instead of a render body — and so the 90-day rule (D11) is
 * stated in exactly one place rather than duplicated between the form's
 * gating and the service's enforcement.
 */
export async function getSlugChangeStatus(
  sellerId: string,
): Promise<{ canChange: boolean; remainingDays: number | null }> {
  const last = await db.sellerSlugHistory.findFirst({
    where: { sellerId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (!last) return { canChange: true, remainingDays: null };

  const daysSince = (Date.now() - last.createdAt.getTime()) / 86_400_000;
  if (daysSince >= SLUG_CHANGE_COOLDOWN_DAYS) return { canChange: true, remainingDays: null };

  return { canChange: false, remainingDays: Math.ceil(SLUG_CHANGE_COOLDOWN_DAYS - daysSince) };
}
