import "server-only";
import { db, Prisma } from "@/lib/db";
import { clientEnv } from "@/env.client";
import { revalidateTenant } from "@/lib/cache/revalidate";
import type { DomainStatus } from "@/generated/prisma/enums";

/**
 * Custom domains for the Gold plan (D3, D41).
 *
 * The resolver already serves a seller's site on `SellerWebsite.customDomain`
 * once its status is ACTIVE. Provisioning — DNS and the TLS certificate at the
 * edge — is done by the Bzaro team for now, so this module only records the
 * seller's request (PENDING_DNS) and lets an admin switch it on or mark it
 * failed. Automating the edge step is a later phase.
 */

const HOSTNAME = /^(?=.{4,253}$)(?!-)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/;

export function normaliseDomain(input: string): string | null {
  const value = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");
  if (!HOSTNAME.test(value)) return null;
  const root = clientEnv.NEXT_PUBLIC_ROOT_DOMAIN.toLowerCase();
  if (value === root || value.endsWith(`.${root}`)) return null;
  return value;
}

export async function getCustomDomain(sellerId: string) {
  return db.sellerWebsite.findUnique({
    where: { sellerId },
    select: { customDomain: true, customDomainStatus: true, customDomainVerifiedAt: true },
  });
}

export async function requestCustomDomain(params: {
  sellerId: string;
  userId: string;
  domain: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const seller = await db.seller.findUnique({
    where: { id: params.sellerId },
    select: { webPresence: true },
  });
  if (seller?.webPresence !== "CUSTOM_DOMAIN") {
    return { ok: false, error: "A custom domain is part of the Gold plan." };
  }
  const domain = normaliseDomain(params.domain);
  if (!domain) return { ok: false, error: "Enter a domain like www.yourbusiness.com." };

  try {
    const updated = await db.sellerWebsite.updateMany({
      where: { sellerId: params.sellerId },
      data: {
        customDomain: domain,
        customDomainStatus: "PENDING_DNS",
        customDomainVerifiedAt: null,
      },
    });
    if (updated.count !== 1) {
      return {
        ok: false,
        error: "Set up your website (pick a template) first, then add a domain.",
      };
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "That domain is already connected to another Bzaro site." };
    }
    throw error;
  }
  await db.auditLog.create({
    data: {
      actorId: params.userId,
      sellerId: params.sellerId,
      action: "domain.requested",
      after: { domain },
    },
  });
  return { ok: true };
}

export async function setCustomDomainStatus(params: {
  sellerId: string;
  adminId: string;
  status: Extract<DomainStatus, "ACTIVE" | "FAILED" | "NONE">;
}) {
  const seller = await db.seller.findUnique({
    where: { id: params.sellerId },
    select: { slug: true },
  });
  if (!seller) return;
  await db.sellerWebsite.update({
    where: { sellerId: params.sellerId },
    data: {
      customDomainStatus: params.status,
      customDomainVerifiedAt: params.status === "ACTIVE" ? new Date() : null,
      ...(params.status === "NONE" ? { customDomain: null } : {}),
    },
  });
  await db.auditLog.create({
    data: {
      actorId: params.adminId,
      sellerId: params.sellerId,
      action: "domain.status_changed",
      after: { status: params.status },
    },
  });
  revalidateTenant(seller.slug);
}
