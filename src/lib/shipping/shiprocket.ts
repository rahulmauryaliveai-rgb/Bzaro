import "server-only";

/**
 * Shiprocket, over plain `fetch` — same rule as Razorpay and Resend: no vendor
 * SDK outside this module.
 *
 * Every call runs against the *seller's* own API user, so shipments, rates and
 * labels belong to their Shiprocket account. Bzaro is never the shipper.
 *
 * ── Tokens ───────────────────────────────────────────────────────────────────
 * Shiprocket has no API-key auth: you exchange an email and password for a
 * bearer token that lasts ~10 days. Logging in on every request would be both
 * slow and a good way to get rate-limited, so the token is cached — see
 * `getShiprocketToken` in integration.service.ts, which stores it encrypted
 * alongside the credentials and refreshes it when it expires.
 */

const API = "https://apiv2.shiprocket.in/v1/external";

/** Shiprocket says 10 days; refresh a day early so a job never races expiry. */
export const SHIPROCKET_TOKEN_TTL_MS = 9 * 24 * 60 * 60 * 1000;

export type ShiprocketAuth = { token: string; expiresAt: Date };

export type ShiprocketResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function call<T>(
  path: string,
  init: RequestInit & { token?: string },
): Promise<ShiprocketResult<T>> {
  try {
    const response = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
        ...init.headers,
      },
    });

    const text = await response.text();

    if (!response.ok) {
      // Shiprocket puts the useful part in the body, not the status.
      return { ok: false, error: `Shiprocket returned ${response.status}: ${text.slice(0, 300)}` };
    }

    return { ok: true, data: (text ? JSON.parse(text) : {}) as T };
  } catch (error) {
    return { ok: false, error: `Could not reach Shiprocket: ${String(error).slice(0, 200)}` };
  }
}

export async function shiprocketLogin(
  email: string,
  password: string,
): Promise<ShiprocketResult<ShiprocketAuth>> {
  const result = await call<{ token?: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!result.ok) return result;

  const token = result.data.token;
  if (!token) return { ok: false, error: "Shiprocket did not return a token." };

  return { ok: true, data: { token, expiresAt: new Date(Date.now() + SHIPROCKET_TOKEN_TTL_MS) } };
}

export type ShiprocketOrderInput = {
  orderNumber: string;
  orderDate: string;
  pickupLocation?: string;
  billing: {
    name: string;
    address: string;
    address2?: string;
    city: string;
    state: string;
    pincode: string;
    phone: string;
    email?: string;
  };
  items: Array<{ name: string; sku: string; units: number; sellingPrice: number }>;
  subTotal: number;
  /** Centimetres and kilograms — Shiprocket rejects a shipment without them. */
  dimensions: { lengthCm: number; breadthCm: number; heightCm: number; weightKg: number };
  paymentMethod: "Prepaid" | "COD";
};

export type ShiprocketOrderCreated = {
  order_id?: number;
  shipment_id?: number;
  status?: string;
};

export async function createShiprocketOrder(
  token: string,
  input: ShiprocketOrderInput,
): Promise<ShiprocketResult<ShiprocketOrderCreated>> {
  return call<ShiprocketOrderCreated>("/orders/create/adhoc", {
    method: "POST",
    token,
    body: JSON.stringify({
      order_id: input.orderNumber,
      order_date: input.orderDate,
      pickup_location: input.pickupLocation ?? "Primary",
      billing_customer_name: input.billing.name,
      billing_last_name: "",
      billing_address: input.billing.address,
      billing_address_2: input.billing.address2 ?? "",
      billing_city: input.billing.city,
      billing_pincode: input.billing.pincode,
      billing_state: input.billing.state,
      billing_country: "India",
      billing_email: input.billing.email ?? "",
      billing_phone: input.billing.phone,
      shipping_is_billing: true,
      order_items: input.items.map((item) => ({
        name: item.name,
        sku: item.sku,
        units: item.units,
        selling_price: item.sellingPrice,
      })),
      payment_method: input.paymentMethod,
      sub_total: input.subTotal,
      length: input.dimensions.lengthCm,
      breadth: input.dimensions.breadthCm,
      height: input.dimensions.heightCm,
      weight: input.dimensions.weightKg,
    }),
  });
}

export type ShiprocketAwb = { awb_code?: string; courier_name?: string };

export async function assignShiprocketAwb(
  token: string,
  shipmentId: number,
): Promise<ShiprocketResult<ShiprocketAwb>> {
  const result = await call<{ response?: { data?: ShiprocketAwb } }>("/courier/assign/awb", {
    method: "POST",
    token,
    body: JSON.stringify({ shipment_id: shipmentId }),
  });
  if (!result.ok) return result;

  const data = result.data.response?.data;
  if (!data?.awb_code) {
    return { ok: false, error: "Shiprocket assigned no AWB — check courier serviceability." };
  }
  return { ok: true, data };
}

/** Public tracking page for a waybill. */
export function trackingUrlFor(awb: string): string {
  return `https://shiprocket.co/tracking/${encodeURIComponent(awb)}`;
}
