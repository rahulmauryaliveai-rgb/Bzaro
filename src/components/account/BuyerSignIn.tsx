"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { BuyerAuth } from "@/components/buyer/AuthModal";
import { buyerGoogleSignInAction } from "@/server/actions/buyer";

export function BuyerSignIn({
  next,
  initialView,
  autoGoogle = false,
}: {
  next: string;
  initialView: "login" | "signup";
  /** The buyer already pressed "Continue with Google" on a store: go straight on. */
  autoGoogle?: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (autoGoogle) formRef.current?.requestSubmit();
  }, [autoGoogle]);

  if (autoGoogle) {
    return (
      <form ref={formRef} action={buyerGoogleSignInAction} className="space-y-3 text-center">
        <input type="hidden" name="next" value={next} />
        <p className="text-sm text-neutral-600">Taking you to Google…</p>
        <button type="submit" className="text-brand-700 text-sm font-medium underline">
          Continue with Google
        </button>
      </form>
    );
  }

  return (
    <BuyerAuth
      initialView={initialView}
      next={next}
      onDone={() => {
        router.replace(next);
        router.refresh();
      }}
    />
  );
}
