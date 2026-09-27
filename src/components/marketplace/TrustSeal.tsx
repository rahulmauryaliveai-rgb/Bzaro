import { ShieldCheck } from "lucide-react";

/**
 * Gold plan trust seal (D41) — shown next to the seller's name wherever the
 * marketplace lists them. Driven by `Seller.trustSeal`, which follows the
 * plan and is recomputed on every subscription change.
 */
export function TrustSeal({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-200"
      title="Trust Seal — a Bzaro Gold seller: GST-verified, with a paid, active membership"
    >
      <ShieldCheck className="h-3 w-3" aria-hidden="true" />
      {compact ? "Trust Seal" : "Trust Seal verified"}
    </span>
  );
}
