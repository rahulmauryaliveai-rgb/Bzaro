import "server-only";
import { db } from "@/lib/db";
import { decryptJson, encryptJson, lastFour } from "@/lib/crypto/secrets";
import { shiprocketLogin } from "@/lib/shipping/shiprocket";
import type { FeatureSource, IntegrationMode } from "@/generated/prisma/enums";

/**
 * Seller payment and shipping integrations (Phase 6).
 *
 * ── The rule this file exists to enforce ─────────────────────────────────────
 * A decrypted credential never leaves the server, and never leaves this module
 * except through `getRazorpayConfig` / `getShiprocketConfig`, which are called
 * only by the checkout and shipping services.
 *
 * Everything the UI needs is in `configHint` — a last-4 and a mode — which is
 * stored in clear precisely so rendering the settings screen never requires
 * decrypting anything.
 */

export type RazorpayConfig = {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  /** Offer cash on delivery alongside online payment. */
  codEnabled?: boolean;
};

export type ShiprocketConfig = {
  email: string;
  password: string;
  pickupPostcode?: string;
  pickupLocation?: string;
  /** Defaults applied to any order without its own dimensions. */
  defaultWeightKg?: number;
  defaultLengthCm?: number;
  defaultBreadthCm?: number;
  defaultHeightCm?: number;
  /** Create the shipment as soon as an order is paid, rather than on "Ship now". */
  autoCreate?: boolean;
  /**
   * Cached bearer token. Shiprocket has no API-key auth, so this is the only
   * way to avoid logging in on every call. Encrypted with the password, since
   * it grants exactly the same access.
   */
  token?: string;
  tokenExpiresAt?: string;
};

export type IntegrationSummary = {
  enabled: boolean;
  mode: IntegrationMode;
  /** e.g. "••••CdEf". Never the key itself. */
  hint: string | null;
  lastTestedAt: Date | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
};

export async function getIntegrationSummary(
  sellerId: string,
  type: "RAZORPAY" | "SHIPROCKET",
): Promise<IntegrationSummary | null> {
  const row = await db.sellerIntegration.findUnique({
    where: { sellerId_type: { sellerId, type } },
    select: {
      enabled: true,
      mode: true,
      configHint: true,
      lastTestedAt: true,
      lastTestOk: true,
      lastTestError: true,
    },
  });
  if (!row) return null;

  const hint = (row.configHint as { hint?: string } | null)?.hint ?? null;
  return {
    enabled: row.enabled,
    mode: row.mode,
    hint,
    lastTestedAt: row.lastTestedAt,
    lastTestOk: row.lastTestOk,
    lastTestError: row.lastTestError,
  };
}

export async function saveRazorpayConfig(
  sellerId: string,
  config: RazorpayConfig,
  mode: IntegrationMode,
): Promise<void> {
  const existing = await db.sellerIntegration.findUnique({
    where: { sellerId_type: { sellerId, type: "RAZORPAY" } },
    select: { encryptedConfig: true },
  });
  // The COD preference is a store setting, not a credential — re-pasting keys
  // must not silently turn it off.
  const previous = existing ? decryptJson<RazorpayConfig>(existing.encryptedConfig) : null;
  const merged: RazorpayConfig = { codEnabled: previous?.codEnabled, ...config };

  const encryptedConfig = encryptJson(merged);
  const configHint = { hint: `••••${lastFour(config.keyId)}` };

  await db.sellerIntegration.upsert({
    where: { sellerId_type: { sellerId, type: "RAZORPAY" } },
    create: { sellerId, type: "RAZORPAY", mode, encryptedConfig, configHint, enabled: false },
    // `enabled` is deliberately untouched: saving new keys must not silently
    // switch payments on, and must not switch them off for a live store.
    update: { mode, encryptedConfig, configHint, lastTestedAt: null, lastTestOk: null },
  });
}

export async function saveShiprocketConfig(
  sellerId: string,
  config: ShiprocketConfig,
  mode: IntegrationMode,
): Promise<void> {
  const existing = await db.sellerIntegration.findUnique({
    where: { sellerId_type: { sellerId, type: "SHIPROCKET" } },
    select: { encryptedConfig: true },
  });

  // Carry over the seller's preferences, but deliberately NOT the cached token:
  // new credentials invalidate it, and reusing a token minted from the old
  // password would mask a typo until it expired days later.
  const previous = existing ? decryptJson<ShiprocketConfig>(existing.encryptedConfig) : null;
  const merged: ShiprocketConfig = {
    autoCreate: previous?.autoCreate,
    ...config,
    token: undefined,
    tokenExpiresAt: undefined,
  };

  const encryptedConfig = encryptJson(merged);
  const configHint = { hint: config.email };

  await db.sellerIntegration.upsert({
    where: { sellerId_type: { sellerId, type: "SHIPROCKET" } },
    create: { sellerId, type: "SHIPROCKET", mode, encryptedConfig, configHint, enabled: false },
    update: { mode, encryptedConfig, configHint, lastTestedAt: null, lastTestOk: null },
  });
}

/**
 * The stored credentials regardless of whether the integration is switched on.
 *
 * Exists for "Test connection", which necessarily runs BEFORE the seller
 * enables payments — the whole point is to find out whether the keys work
 * before any buyer depends on them. Never call this from a checkout path;
 * `getRazorpayConfig` is the one that enforces `enabled`.
 */
export async function readRazorpayConfigUnchecked(
  sellerId: string,
): Promise<RazorpayConfig | null> {
  const row = await db.sellerIntegration.findUnique({
    where: { sellerId_type: { sellerId, type: "RAZORPAY" } },
    select: { encryptedConfig: true },
  });
  return row ? decryptJson<RazorpayConfig>(row.encryptedConfig) : null;
}

/** Server-side only. Returns null when the seller has not configured this. */
export async function getRazorpayConfig(
  sellerId: string,
): Promise<{ config: RazorpayConfig; mode: IntegrationMode } | null> {
  const row = await db.sellerIntegration.findUnique({
    where: { sellerId_type: { sellerId, type: "RAZORPAY" } },
    select: { encryptedConfig: true, enabled: true, mode: true },
  });
  if (!row?.enabled) return null;

  return { config: decryptJson<RazorpayConfig>(row.encryptedConfig), mode: row.mode };
}

export async function getShiprocketConfig(
  sellerId: string,
): Promise<{ config: ShiprocketConfig; mode: IntegrationMode } | null> {
  const row = await db.sellerIntegration.findUnique({
    where: { sellerId_type: { sellerId, type: "SHIPROCKET" } },
    select: { encryptedConfig: true, enabled: true, mode: true },
  });
  if (!row?.enabled) return null;

  return { config: decryptJson<ShiprocketConfig>(row.encryptedConfig), mode: row.mode };
}

/**
 * A usable Shiprocket bearer token, logging in only when the cached one has
 * expired. The refreshed token is written back encrypted, so a burst of
 * shipments costs one login rather than one per order.
 *
 * Returns null when the seller has not enabled Shiprocket — callers must treat
 * that as "shipping is manual for this seller", not as an error.
 */
export async function getShiprocketToken(
  sellerId: string,
): Promise<{ token: string; config: ShiprocketConfig } | null> {
  const stored = await getShiprocketConfig(sellerId);
  if (!stored) return null;

  const { config } = stored;
  const expiresAt = config.tokenExpiresAt ? new Date(config.tokenExpiresAt) : null;

  if (config.token && expiresAt && expiresAt > new Date()) {
    return { token: config.token, config };
  }

  const auth = await shiprocketLogin(config.email, config.password);
  if (!auth.ok) return null;

  const refreshed: ShiprocketConfig = {
    ...config,
    token: auth.data.token,
    tokenExpiresAt: auth.data.expiresAt.toISOString(),
  };

  await db.sellerIntegration.update({
    where: { sellerId_type: { sellerId, type: "SHIPROCKET" } },
    data: { encryptedConfig: encryptJson(refreshed) },
  });

  return { token: auth.data.token, config: refreshed };
}

/** Flip a Razorpay-side store setting without touching the credentials. */
export async function patchRazorpayConfig(
  sellerId: string,
  patch: Partial<RazorpayConfig>,
): Promise<void> {
  const row = await db.sellerIntegration.findUnique({
    where: { sellerId_type: { sellerId, type: "RAZORPAY" } },
    select: { encryptedConfig: true },
  });
  if (!row) return;

  const current = decryptJson<RazorpayConfig>(row.encryptedConfig);
  await db.sellerIntegration.update({
    where: { sellerId_type: { sellerId, type: "RAZORPAY" } },
    data: { encryptedConfig: encryptJson({ ...current, ...patch }) },
  });
}

/** Merge changes into the stored config without disturbing the cached token. */
export async function patchShiprocketConfig(
  sellerId: string,
  patch: Partial<ShiprocketConfig>,
): Promise<void> {
  const row = await db.sellerIntegration.findUnique({
    where: { sellerId_type: { sellerId, type: "SHIPROCKET" } },
    select: { encryptedConfig: true },
  });
  if (!row) return;

  const current = decryptJson<ShiprocketConfig>(row.encryptedConfig);
  await db.sellerIntegration.update({
    where: { sellerId_type: { sellerId, type: "SHIPROCKET" } },
    data: { encryptedConfig: encryptJson({ ...current, ...patch }) },
  });
}

export async function setIntegrationEnabled(
  sellerId: string,
  type: "RAZORPAY" | "SHIPROCKET",
  enabled: boolean,
): Promise<void> {
  await db.sellerIntegration.update({
    where: { sellerId_type: { sellerId, type } },
    data: { enabled },
  });
}

export async function recordTestResult(
  sellerId: string,
  type: "RAZORPAY" | "SHIPROCKET",
  result: { ok: boolean; error?: string },
): Promise<void> {
  await db.sellerIntegration.update({
    where: { sellerId_type: { sellerId, type } },
    data: {
      lastTestedAt: new Date(),
      lastTestOk: result.ok,
      lastTestError: result.error?.slice(0, 500) ?? null,
    },
  });
}

// ── Feature flags ────────────────────────────────────────────────────────────

export type SellerFeatures = {
  paymentsEnabled: boolean;
  shippingEnabled: boolean;
  codEnabled: boolean;
  source: FeatureSource;
};

const NO_FEATURES: SellerFeatures = {
  paymentsEnabled: false,
  shippingEnabled: false,
  codEnabled: true,
  source: "PLAN",
};

/**
 * What this seller is allowed to do. A missing row means "nothing paid for",
 * which is the correct default for every free seller.
 */
export async function getSellerFeatures(sellerId: string): Promise<SellerFeatures> {
  const row = await db.sellerFeature.findUnique({
    where: { sellerId },
    select: { paymentsEnabled: true, shippingEnabled: true, codEnabled: true, source: true },
  });
  return row ?? NO_FEATURES;
}

/** The seller's own COD switch. Only meaningful once orders are switched on. */
export async function setCodEnabled(sellerId: string, codEnabled: boolean): Promise<void> {
  await db.sellerFeature.upsert({
    where: { sellerId },
    create: { sellerId, codEnabled },
    update: { codEnabled },
  });
}

export type CheckoutMethods = { online: boolean; cod: boolean };

/**
 * How a buyer can pay this store right now (D40). Online needs the seller's
 * own Razorpay keys, enabled; cash on delivery needs only the seller's COD
 * switch. Both require orders to be switched on for the seller by an admin.
 */
export async function getCheckoutMethods(sellerId: string): Promise<CheckoutMethods> {
  const [features, integration] = await Promise.all([
    getSellerFeatures(sellerId),
    db.sellerIntegration.findUnique({
      where: { sellerId_type: { sellerId, type: "RAZORPAY" } },
      select: { enabled: true },
    }),
  ]);
  if (!features.paymentsEnabled) return { online: false, cod: false };
  return { online: Boolean(integration?.enabled), cod: features.codEnabled };
}

export async function setSellerFeatures(
  sellerId: string,
  features: { paymentsEnabled?: boolean; shippingEnabled?: boolean },
  source: FeatureSource,
  actorId?: string | null,
  note?: string,
): Promise<void> {
  const data = {
    ...(features.paymentsEnabled !== undefined
      ? { paymentsEnabled: features.paymentsEnabled }
      : {}),
    ...(features.shippingEnabled !== undefined
      ? { shippingEnabled: features.shippingEnabled }
      : {}),
    source,
    updatedById: actorId ?? null,
    note: note ?? null,
  };

  await db.$transaction([
    db.sellerFeature.upsert({
      where: { sellerId },
      create: { sellerId, paymentsEnabled: false, shippingEnabled: false, ...data },
      update: data,
    }),
    db.auditLog.create({
      data: {
        actorId: actorId ?? null,
        sellerId,
        action: "seller.features_changed",
        after: { ...features, source },
      },
    }),
  ]);
}

/**
 * Whether this storefront takes orders (shows Add to cart): an admin has
 * switched orders on for the seller AND at least one way to pay exists —
 * the seller's Razorpay, or cash on delivery (D40).
 */
export async function canAcceptPayments(sellerId: string): Promise<boolean> {
  const methods = await getCheckoutMethods(sellerId);
  return methods.online || methods.cod;
}
