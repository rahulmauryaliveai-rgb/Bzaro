"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { loadPendingRequirement } from "@/lib/buyer/pending-requirement";

/**
 * Client half of /account/continue: resume an unsent requirement started on
 * bzaro.in, else continue to `next`. (A draft started on a store lives in that
 * store's sessionStorage and is picked up there, not here.)
 */
export function ContinueAfterSignIn({ next }: { next: string }) {
  const router = useRouter();

  useEffect(() => {
    router.replace(loadPendingRequirement() ? "/post-requirement?resume=1" : next);
  }, [router, next]);

  return (
    <p className="mx-auto max-w-md px-4 py-16 text-center text-sm text-neutral-500">One moment…</p>
  );
}
