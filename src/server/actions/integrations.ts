"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSeller } from "@/lib/auth/guards";
import { encryptionAvailable } from "@/lib/crypto/secrets";
import { testRazorpayCredentials } from "@/lib/payments/razorpay";
import { createShipmentForOrder } from "@/server/services/shipping.service";
import {
  getSellerFeatures,
  patchShiprocketConfig,
  readRazorpayConfigUnchecked,
  recordTestResult,
  saveRazorpayConfig,
  saveShiprocketConfig,
  setCodEnabled,
  setIntegrationEnabled,
} from "@/server/services/integration.service";

/**
 * Seller payment / shipping credentials (Phase 6).
 *
 * Every action re-checks the seller scope and the feature flag. A seller whose
 * plan does not include payments cannot save Razorpay keys by posting to this
 * endpoint directly — the locked UI is a courtesy, this is the control.
 */

export type IntegrationState = {
  ok?: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
};

const razorpaySchema = z.object({
  keyId: z.string().trim().min(8, "Enter your Key ID").max(120),
  keySecret: z.string().trim().min(8, "Enter your Key Secret").max(200),
  webhookSecret: z.string().trim().min(4, "Enter your Webhook Secret").max(200),
  mode: z.enum(["TEST", "LIVE"]),
});

const optionalNumber = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? Number(value) : undefined))
  .refine((value) => value === undefined || (Number.isFinite(value) && value > 0), {
    message: "Enter a positive number",
  });

const shiprocketSchema = z.object({
  email: z.string().trim().email("Enter the API user's email").max(254),
  password: z.string().trim().min(4, "Enter the API user's password").max(200),
  pickupPostcode: z
    .string()
    .trim()
    .regex(/^[1-9][0-9]{5}$/, "Enter a six-digit PIN code")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  /** The nickname of the pickup address as it is named in Shiprocket. */
  pickupLocation: z
    .string()
    .trim()
    .max(120)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  defaultWeightKg: optionalNumber,
  defaultLengthCm: optionalNumber,
  defaultBreadthCm: optionalNumber,
  defaultHeightCm: optionalNumber,
  mode: z.enum(["TEST", "LIVE"]),
});

function fieldErrorsFrom(issues: Array<{ path: PropertyKey[]; message: string }>) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export async function saveRazorpayAction(
  _previous: IntegrationState,
  formData: FormData,
): Promise<IntegrationState> {
  const scope = await requireSeller();

  const features = await getSellerFeatures(scope.sellerId);
  if (!features.paymentsEnabled) {
    return { error: "Payments are not included in your plan yet." };
  }

  if (!encryptionAvailable()) {
    return {
      error:
        "Payment credentials can't be stored securely on this deployment. " +
        "Ask an administrator to set INTEGRATIONS_ENCRYPTION_KEY.",
    };
  }

  const parsed = razorpaySchema.safeParse({
    keyId: formData.get("keyId"),
    keySecret: formData.get("keySecret"),
    webhookSecret: formData.get("webhookSecret"),
    mode: formData.get("mode"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  await saveRazorpayConfig(
    scope.sellerId,
    {
      keyId: parsed.data.keyId,
      keySecret: parsed.data.keySecret,
      webhookSecret: parsed.data.webhookSecret,
    },
    parsed.data.mode,
  );

  revalidatePath("/dashboard/settings/payments");
  return { ok: true, message: "Saved. Test the connection before switching payments on." };
}

export async function testRazorpayAction(): Promise<IntegrationState> {
  const scope = await requireSeller();

  // Deliberately the unchecked read: testing happens before the seller
  // switches payments on, which is the only sensible order.
  const config = await readRazorpayConfigUnchecked(scope.sellerId);
  if (!config) return { error: "Save your Razorpay keys first." };

  const result = await testRazorpayCredentials(config);
  await recordTestResult(scope.sellerId, "RAZORPAY", {
    ok: result.ok,
    error: result.ok ? undefined : result.error,
  });

  revalidatePath("/dashboard/settings/payments");
  return result.ok
    ? { ok: true, message: "Razorpay accepted these keys." }
    : { error: result.error };
}

export async function toggleRazorpayAction(
  _previous: IntegrationState,
  formData: FormData,
): Promise<IntegrationState> {
  const scope = await requireSeller();

  const features = await getSellerFeatures(scope.sellerId);
  if (!features.paymentsEnabled) {
    return { error: "Payments are not included in your plan yet." };
  }

  const enabled = formData.get("enabled") === "true";
  await setIntegrationEnabled(scope.sellerId, "RAZORPAY", enabled);

  revalidatePath("/dashboard/settings/payments");
  return {
    ok: true,
    message: enabled ? "Payments are on for your store." : "Payments are off.",
  };
}

export async function saveShiprocketAction(
  _previous: IntegrationState,
  formData: FormData,
): Promise<IntegrationState> {
  const scope = await requireSeller();

  const features = await getSellerFeatures(scope.sellerId);
  if (!features.shippingEnabled) {
    return { error: "Shipping is not included in your plan yet." };
  }

  if (!encryptionAvailable()) {
    return {
      error:
        "Shipping credentials can't be stored securely on this deployment. " +
        "Ask an administrator to set INTEGRATIONS_ENCRYPTION_KEY.",
    };
  }

  const parsed = shiprocketSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    pickupPostcode: formData.get("pickupPostcode") ?? "",
    pickupLocation: formData.get("pickupLocation") ?? "",
    defaultWeightKg: formData.get("defaultWeightKg") ?? "",
    defaultLengthCm: formData.get("defaultLengthCm") ?? "",
    defaultBreadthCm: formData.get("defaultBreadthCm") ?? "",
    defaultHeightCm: formData.get("defaultHeightCm") ?? "",
    mode: formData.get("mode"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  await saveShiprocketConfig(
    scope.sellerId,
    {
      email: parsed.data.email,
      password: parsed.data.password,
      pickupPostcode: parsed.data.pickupPostcode,
      pickupLocation: parsed.data.pickupLocation,
      defaultWeightKg: parsed.data.defaultWeightKg,
      defaultLengthCm: parsed.data.defaultLengthCm,
      defaultBreadthCm: parsed.data.defaultBreadthCm,
      defaultHeightCm: parsed.data.defaultHeightCm,
    },
    parsed.data.mode,
  );

  revalidatePath("/dashboard/settings/shipping");
  return { ok: true, message: "Saved." };
}

export async function toggleShiprocketAction(
  _previous: IntegrationState,
  formData: FormData,
): Promise<IntegrationState> {
  const scope = await requireSeller();

  const features = await getSellerFeatures(scope.sellerId);
  if (!features.shippingEnabled) {
    return { error: "Shipping is not included in your plan yet." };
  }

  await setIntegrationEnabled(scope.sellerId, "SHIPROCKET", formData.get("enabled") === "true");
  revalidatePath("/dashboard/settings/shipping");
  return { ok: true };
}

/** "Ship now" from the Orders tab. */
export async function shipOrderAction(
  _previous: IntegrationState,
  formData: FormData,
): Promise<IntegrationState> {
  const scope = await requireSeller();

  const features = await getSellerFeatures(scope.sellerId);
  if (!features.shippingEnabled) {
    return { error: "Shipping is not included in your plan yet." };
  }

  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return { error: "Choose an order." };

  const result = await createShipmentForOrder(scope.sellerId, orderId);

  revalidatePath("/dashboard/orders");

  if (result.ok) return { ok: true, message: `Booked. AWB ${result.awb}.` };

  switch (result.reason) {
    case "already_shipped":
      return { error: "That order already has a shipment." };
    case "not_paid":
      return { error: "That order hasn't been paid yet." };
    case "not_configured":
      return { error: "Connect Shiprocket and switch it on first." };
    case "not_found":
      return { error: "We couldn't find that order." };
    default:
      return { error: result.error ?? "Shiprocket couldn't book that shipment." };
  }
}

/** Auto-create shipments on payment, or leave it to "Ship now". */
export async function setAutoShipAction(
  _previous: IntegrationState,
  formData: FormData,
): Promise<IntegrationState> {
  const scope = await requireSeller();

  const features = await getSellerFeatures(scope.sellerId);
  if (!features.shippingEnabled) {
    return { error: "Shipping is not included in your plan yet." };
  }

  const autoCreate = formData.get("autoCreate") === "true";
  await patchShiprocketConfig(scope.sellerId, { autoCreate });

  revalidatePath("/dashboard/settings/shipping");
  return {
    ok: true,
    message: autoCreate
      ? "Shipments will be booked as soon as an order is paid."
      : "You'll book each shipment yourself.",
  };
}

/** Offer cash on delivery alongside online payment. */
export async function setCodAction(
  _previous: IntegrationState,
  formData: FormData,
): Promise<IntegrationState> {
  const scope = await requireSeller();

  const features = await getSellerFeatures(scope.sellerId);
  if (!features.paymentsEnabled) {
    return { error: "Payments are not included in your plan yet." };
  }

  const codEnabled = formData.get("codEnabled") === "true";
  await setCodEnabled(scope.sellerId, codEnabled);

  revalidatePath("/dashboard/settings/payments");
  return {
    ok: true,
    message: codEnabled ? "Buyers can now choose cash on delivery." : "Cash on delivery is off.",
  };
}
