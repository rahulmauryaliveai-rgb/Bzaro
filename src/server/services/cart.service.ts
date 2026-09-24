import "server-only";
import { db } from "@/lib/db";
import { canAcceptPayments } from "@/server/services/integration.service";

/**
 * Carts (Phase 5). Storefronts only — never the apex.
 *
 * One cart per buyer per store, server-side so it survives devices. Prices are
 * snapshotted when an item is added, then re-validated at checkout: a price
 * that moves mid-session must not silently change what the buyer agreed to,
 * but neither may a stale snapshot decide what they are charged.
 */

export type CartLine = {
  itemId: string;
  productId: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  /** True when the catalogue price no longer matches the snapshot. */
  priceChanged: boolean;
  currentPriceMinor: number | null;
};

export type CartView = {
  id: string;
  sellerId: string;
  currency: string;
  lines: CartLine[];
  subtotalMinor: number;
  itemCount: number;
};

export type AddToCartResult =
  | { ok: true }
  | { ok: false; reason: "payments_unavailable" | "product_unavailable" | "not_purchasable" };

async function findOrCreateCart(sellerId: string, buyerId: string): Promise<string> {
  const cart = await db.cart.upsert({
    where: { sellerId_buyerId: { sellerId, buyerId } },
    create: { sellerId, buyerId },
    update: {},
    select: { id: true },
  });
  return cart.id;
}

export async function addToCart(params: {
  sellerId: string;
  buyerId: string;
  productId: string;
  quantity: number;
}): Promise<AddToCartResult> {
  if (!(await canAcceptPayments(params.sellerId))) {
    return { ok: false, reason: "payments_unavailable" };
  }

  const product = await db.product.findFirst({
    where: {
      id: params.productId,
      sellerId: params.sellerId,
      status: "PUBLISHED",
      deletedAt: null,
      moderationStatus: "APPROVED",
    },
    select: { id: true, priceMinor: true, priceOnRequest: true, currency: true },
  });
  if (!product) return { ok: false, reason: "product_unavailable" };

  // "Ask for price" products have no price to charge. They stay enquiry-only
  // even in a store that otherwise takes payment.
  if (product.priceOnRequest || product.priceMinor === null) {
    return { ok: false, reason: "not_purchasable" };
  }

  const cartId = await findOrCreateCart(params.sellerId, params.buyerId);
  const quantity = Math.max(1, Math.trunc(params.quantity));

  await db.cartItem.upsert({
    where: { cartId_productId: { cartId, productId: product.id } },
    create: {
      cartId,
      productId: product.id,
      quantity,
      priceMinor: product.priceMinor,
      currency: product.currency,
    },
    update: { quantity: { increment: quantity } },
  });

  return { ok: true };
}

export async function setCartItemQuantity(params: {
  sellerId: string;
  buyerId: string;
  itemId: string;
  quantity: number;
}): Promise<void> {
  // Scoped through the cart so one buyer cannot touch another's line by id.
  const item = await db.cartItem.findFirst({
    where: {
      id: params.itemId,
      cart: { sellerId: params.sellerId, buyerId: params.buyerId },
    },
    select: { id: true },
  });
  if (!item) return;

  const quantity = Math.trunc(params.quantity);
  if (quantity <= 0) {
    await db.cartItem.delete({ where: { id: item.id } });
    return;
  }

  await db.cartItem.update({ where: { id: item.id }, data: { quantity } });
}

export async function getCart(sellerId: string, buyerId: string): Promise<CartView | null> {
  const cart = await db.cart.findUnique({
    where: { sellerId_buyerId: { sellerId, buyerId } },
    select: {
      id: true,
      sellerId: true,
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          quantity: true,
          priceMinor: true,
          currency: true,
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              priceMinor: true,
              priceOnRequest: true,
              deletedAt: true,
              status: true,
              images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
            },
          },
        },
      },
    },
  });
  if (!cart) return null;

  const lines: CartLine[] = [];
  for (const item of cart.items) {
    const product = item.product;
    // A product withdrawn while it sat in a cart simply drops out of the view;
    // checkout must never charge for something no longer on sale.
    if (!product || product.deletedAt || product.status !== "PUBLISHED") continue;

    const current = product.priceOnRequest ? null : product.priceMinor;
    lines.push({
      itemId: item.id,
      productId: product.id,
      name: product.name,
      slug: product.slug,
      imageUrl: product.images[0]?.url ?? null,
      quantity: item.quantity,
      unitPriceMinor: item.priceMinor,
      lineTotalMinor: item.priceMinor * item.quantity,
      priceChanged: current !== null && current !== item.priceMinor,
      currentPriceMinor: current,
    });
  }

  return {
    id: cart.id,
    sellerId: cart.sellerId,
    currency: cart.items[0]?.currency ?? "INR",
    lines,
    subtotalMinor: lines.reduce((sum, line) => sum + line.lineTotalMinor, 0),
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
  };
}

/**
 * Bring every snapshot back in line with the catalogue. Called at checkout, so
 * the buyer is charged today's price and sees it before paying.
 */
export async function repriceCart(sellerId: string, buyerId: string): Promise<CartView | null> {
  const cart = await getCart(sellerId, buyerId);
  if (!cart) return null;

  const stale = cart.lines.filter((line) => line.priceChanged && line.currentPriceMinor !== null);
  if (stale.length > 0) {
    await db.$transaction(
      stale.map((line) =>
        db.cartItem.update({
          where: { id: line.itemId },
          data: { priceMinor: line.currentPriceMinor! },
        }),
      ),
    );
    return getCart(sellerId, buyerId);
  }

  return cart;
}

export async function clearCart(cartId: string): Promise<void> {
  await db.cartItem.deleteMany({ where: { cartId } });
}
