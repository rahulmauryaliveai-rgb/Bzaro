"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSubdomain, isRootHost, normalizeHost } from "@/lib/utils/url";
import { getBuyerSession } from "@/server/services/buyer.service";
import { addToCart, setCartItemQuantity } from "@/server/services/cart.service";

/**
 * Cart actions (Phase 5). Storefronts only.
 *
 * ── The apex guard is here, not only in the UI ───────────────────────────────
 * A Server Action is a POST endpoint reachable from anywhere, so "we don't
 * render an Add to cart button on bzaro.in" is not a control. Every action
 * below resolves the seller from the REQUEST HOST and refuses on the apex, so
 * a cart can only ever be built on the storefront it belongs to.
 *
 * Resolving from the host also means the client cannot choose which seller's
 * cart it is writing to.
 */

export type CartActionState = {
  ok?: boolean;
  error?: string;
  /** Tells the UI to open the auth modal instead of showing an error. */
  needsAuth?: boolean;
};

/** The seller whose storefront this request arrived on, or null on the apex. */
async function sellerFromHost(): Promise<string | null> {
  const host = normalizeHost((await headers()).get("host"));
  if (!host || isRootHost(host)) return null;

  const slug = getSubdomain(host);
  if (!slug) return null;

  const seller = await db.seller.findFirst({
    where: { slug, status: "VERIFIED", deletedAt: null },
    select: { id: true },
  });
  return seller?.id ?? null;
}

export async function addToCartAction(
  _previous: CartActionState,
  formData: FormData,
): Promise<CartActionState> {
  const sellerId = await sellerFromHost();
  if (!sellerId) return { error: "Carts are only available on a seller's store." };

  const buyer = await getBuyerSession();
  if (!buyer) return { needsAuth: true, error: "Sign in to add items to your cart." };
  if (buyer.isBlocked) return { error: "This account can't place orders." };

  const productId = String(formData.get("productId") ?? "");
  const quantity = Number(formData.get("quantity") ?? 1);
  if (!productId) return { error: "Choose a product." };

  const result = await addToCart({
    sellerId,
    buyerId: buyer.id,
    productId,
    quantity: Number.isFinite(quantity) ? quantity : 1,
  });

  if (!result.ok) {
    switch (result.reason) {
      case "payments_unavailable":
        return { error: "This store isn't taking online orders yet." };
      case "not_purchasable":
        return { error: "This product is quote-only. Ask for a price instead." };
      default:
        return { error: "That product isn't available." };
    }
  }

  revalidatePath("/cart");
  return { ok: true };
}

export async function updateCartItemAction(
  _previous: CartActionState,
  formData: FormData,
): Promise<CartActionState> {
  const sellerId = await sellerFromHost();
  if (!sellerId) return { error: "Carts are only available on a seller's store." };

  const buyer = await getBuyerSession();
  if (!buyer) return { needsAuth: true };

  await setCartItemQuantity({
    sellerId,
    buyerId: buyer.id,
    itemId: String(formData.get("itemId") ?? ""),
    quantity: Number(formData.get("quantity") ?? 0),
  });

  revalidatePath("/cart");
  return { ok: true };
}
