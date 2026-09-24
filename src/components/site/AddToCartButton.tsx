"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { addToCartAction, type CartActionState } from "@/server/actions/cart";
import { BuyerAuth } from "@/components/buyer/AuthModal";

/**
 * Add to cart, on a storefront that takes payment.
 *
 * Shown only when the seller has payments on AND the product has a real price
 * — the server enforces both, this just avoids offering what would be refused.
 * Everywhere else the page renders "Get Quote" instead, which opens the
 * requirement modal.
 */
export function AddToCartButton({ productId }: { productId: string }) {
  const [state, action, pending] = useActionState<CartActionState, FormData>(addToCartAction, {});
  const [quantity, setQuantity] = useState(1);

  if (state.needsAuth) {
    return (
      <div className="rounded-lg border border-neutral-200 p-4">
        <p className="mb-3 text-sm text-neutral-600">
          Sign in to add this to your cart and check out.
        </p>
        <BuyerAuth initialView="signup" onDone={() => window.location.reload()} />
      </div>
    );
  }

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="productId" value={productId} />

      <div className="flex items-center gap-2">
        <label htmlFor="quantity" className="text-sm text-neutral-700">
          Qty
        </label>
        <input
          id="quantity"
          name="quantity"
          type="number"
          min={1}
          max={100000}
          value={quantity}
          onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
          className="w-20 rounded-md border border-neutral-300 px-2 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 flex-1 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add to cart"}
        </button>
      </div>

      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="text-sm text-green-700" role="status">
          Added.{" "}
          <Link href="/cart" className="underline">
            View cart
          </Link>
        </p>
      ) : null}
    </form>
  );
}
