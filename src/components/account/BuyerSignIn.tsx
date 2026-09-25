"use client";

import { useRouter } from "next/navigation";
import { BuyerAuth } from "@/components/buyer/AuthModal";

export function BuyerSignIn({
  next,
  initialView,
}: {
  next: string;
  initialView: "login" | "signup";
}) {
  const router = useRouter();
  return (
    <BuyerAuth
      initialView={initialView}
      onDone={() => {
        router.replace(next);
        router.refresh();
      }}
    />
  );
}
