import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getBuyerSession } from "@/server/services/buyer.service";
import { getCart } from "@/server/services/cart.service";
import { canAcceptPayments } from "@/server/services/integration.service";
import { formatMoney } from "@/lib/utils/money";
import { CartLines } from "@/components/site/CartLines";

export const metadata: Metadata = {
  title: "Your cart",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ tenant: string }> };

/**
 * The storefront cart (Phase 5).
 *
 * Lives under /site/, which the proxy already 404s on the apex — carts exist
 * per store and never on the marketplace.
 */
export default async function CartPage({ params }: Props) {
  const { tenant } = await params;

  const seller = await db.seller.findFirst({
    where: { slug: tenant, status: "VERIFIED", deletedAt: null },
    select: { id: true, businessName: true },
  });
  if (!seller) notFound();

  // A store that cannot take payment has no cart to show.
  if (!(await canAcceptPayments(seller.id))) notFound();

  const buyer = await getBuyerSession();
  if (!buyer) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <h1 className="text-2xl font-semibold">Your cart</h1>
        <p className="mt-3 text-sm text-neutral-600">
          Sign in to see the items you&apos;ve added.
        </p>
        <Link
          href="/login"
          className="mt-5 inline-flex min-h-11 items-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const cart = await getCart(seller.id, buyer.id);

  if (!cart || cart.lines.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <h1 className="text-2xl font-semibold">Your cart</h1>
        <p className="mt-3 text-sm text-neutral-600">Your cart is empty.</p>
        <Link
          href="/products"
          className="mt-5 inline-flex min-h-11 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium hover:bg-neutral-50"
        >
          Browse products
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Your cart</h1>
      <p className="mt-1 text-sm text-neutral-600">{seller.businessName}</p>

      <CartLines lines={cart.lines} currency={cart.currency} />

      <div className="mt-6 flex items-baseline justify-between border-t border-neutral-200 pt-4">
        <span className="text-sm text-neutral-600">Subtotal</span>
        <span className="text-lg font-semibold">
          {formatMoney(cart.subtotalMinor, cart.currency)}
        </span>
      </div>

      {cart.lines.some((line) => line.priceChanged) ? (
        <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Some prices changed since you added them. You&apos;ll be charged today&apos;s price,
          shown again before you pay.
        </p>
      ) : null}

      <Link
        href="/checkout"
        className="mt-6 flex min-h-11 items-center justify-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800"
      >
        Checkout
      </Link>
    </div>
  );
}
