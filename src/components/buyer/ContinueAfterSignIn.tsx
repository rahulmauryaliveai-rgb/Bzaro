"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { loadPendingRequirement } from "@/lib/buyer/pending-requirement";

/** Client half of /account/continue: resume an unsent requirement, if any. */
export function ContinueAfterSignIn() {
  const router = useRouter();

  useEffect(() => {
    router.replace(
      loadPendingRequirement() ? "/post-requirement?resume=1" : "/account/requirements",
    );
  }, [router]);

  return (
    <p className="mx-auto max-w-md px-4 py-16 text-center text-sm text-neutral-500">One moment…</p>
  );
}
