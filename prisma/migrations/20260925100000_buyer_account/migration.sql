-- ─────────────────────────────────────────────────────────────────────────────
-- Buyer account hub
--
-- Requirement.closedAt: the buyer marked "I found a supplier". Open NEW/VIEWED
-- leads for it are closed at the same time so no seller spends a credit on a
-- requirement that is already filled.
--
-- BuyerProfile.notifyOnResponse: email the buyer when a supplier accepts.
--
-- Additive only.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "Requirement" ADD COLUMN "closedAt" TIMESTAMP(3);

ALTER TABLE "BuyerProfile" ADD COLUMN "notifyOnResponse" BOOLEAN NOT NULL DEFAULT true;
