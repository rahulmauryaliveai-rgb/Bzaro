import { Crown } from "lucide-react";

/**
 * Gold plan trust seal (D41) — shown next to the seller's name wherever the
 * marketplace lists them. Driven by `Seller.trustSeal`, which follows the
 * plan and is recomputed on every subscription change.
 */
export function TrustSeal({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-linear-to-r from-amber-400 via-yellow-300 to-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-950 shadow-sm ring-1 shadow-amber-900/10 ring-amber-500/40"
      title="Bzaro Gold seller — Trust Seal: GST-verified, with a paid, active membership"
    >
      <Crown className="h-3 w-3" aria-hidden="true" />
      {compact ? "Gold" : "Gold · Trust Seal"}
    </span>
  );
}
