-- ─────────────────────────────────────────────────────────────────────────────
-- Saved sellers (Phase 7)
--
-- Buyer-owned: "my saved suppliers". Deliberately NOT registered in
-- src/lib/db-tenant.ts TENANT_MODELS — scoping it by sellerId would make the
-- buyer's own list unqueryable, which is the only way it is ever read.
--
-- Additive only. Note that `prisma migrate diff` proposes dropping the
-- generated searchVector columns and trigram indexes, because they live in
-- these migration files rather than in the Prisma datamodel; this file
-- deliberately leaves them alone.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "SavedSeller" (
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedSeller_pkey" PRIMARY KEY ("buyerId","sellerId")
);

-- The buyer's list, newest first.
CREATE INDEX "SavedSeller_buyerId_createdAt_idx" ON "SavedSeller"("buyerId", "createdAt" DESC);
-- "how many buyers saved this seller", and the cascade on seller deletion.
CREATE INDEX "SavedSeller_sellerId_idx" ON "SavedSeller"("sellerId");

ALTER TABLE "SavedSeller" ADD CONSTRAINT "SavedSeller_buyerId_fkey"
  FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedSeller" ADD CONSTRAINT "SavedSeller_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;
