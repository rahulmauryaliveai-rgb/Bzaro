-- D41: Free / Pro / Gold plans, Razorpay billing to Bzaro, add-ons, refunds,
-- weekly + daily lead delivery. Additive only: no column or row is dropped.

-- ── Enums ────────────────────────────────────────────────────────────────────
ALTER TYPE "CreditReason" ADD VALUE IF NOT EXISTS 'ADDON_PURCHASE';
ALTER TYPE "SubStatus" ADD VALUE IF NOT EXISTS 'INCOMPLETE';

CREATE TYPE "LeadSlot" AS ENUM ('WEEKLY', 'DAILY');
CREATE TYPE "AddonKind" AS ENUM ('LEAD_PACK', 'PAYMENT_GATEWAY', 'SHIPPING');
CREATE TYPE "PurchaseStatus" AS ENUM ('CREATED', 'PAID', 'FAILED', 'REFUNDED');
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'REFUNDED', 'FAILED');

-- ── Plan ─────────────────────────────────────────────────────────────────────
ALTER TABLE "Plan"
  ADD COLUMN "yearlyPriceMinor"     INTEGER,
  ADD COLUMN "weeklyLeadQuota"      INTEGER,
  ADD COLUMN "dailyLeadQuota"       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "includesPayments"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "includesShipping"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "trustSeal"            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "gatewayPlanIdMonthly" TEXT,
  ADD COLUMN "gatewayPlanIdYearly"  TEXT;

-- ── Seller (denormalised plan perks) ─────────────────────────────────────────
ALTER TABLE "Seller"
  ADD COLUMN "searchBoost" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "trustSeal"   BOOLEAN NOT NULL DEFAULT false;

-- ── Lead ─────────────────────────────────────────────────────────────────────
ALTER TABLE "Lead" ADD COLUMN "slot" "LeadSlot";
CREATE INDEX "Lead_sellerId_type_createdAt_idx" ON "Lead"("sellerId", "type", "createdAt");

-- ── Subscription / Payment ───────────────────────────────────────────────────
ALTER TABLE "Subscription"
  ADD COLUMN "interval"      "BillingInterval" NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN "gatewayStatus" TEXT;

ALTER TABLE "Payment"
  ADD COLUMN "baseMinor"     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "taxMinor"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "refundedMinor" INTEGER NOT NULL DEFAULT 0;

-- ── Purchase ─────────────────────────────────────────────────────────────────
CREATE TABLE "Purchase" (
  "id"               TEXT NOT NULL,
  "sellerId"         TEXT NOT NULL,
  "kind"             "AddonKind" NOT NULL,
  "quantity"         INTEGER NOT NULL DEFAULT 1,
  "baseMinor"        INTEGER NOT NULL,
  "taxMinor"         INTEGER NOT NULL,
  "totalMinor"       INTEGER NOT NULL,
  "currency"         TEXT NOT NULL DEFAULT 'INR',
  "status"           "PurchaseStatus" NOT NULL DEFAULT 'CREATED',
  "gatewayOrderId"   TEXT,
  "gatewayPaymentId" TEXT,
  "invoiceNumber"    TEXT,
  "paidAt"           TIMESTAMP(3),
  "actorId"          TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Purchase_amounts_check" CHECK ("totalMinor" = "baseMinor" + "taxMinor" AND "baseMinor" > 0),
  CONSTRAINT "Purchase_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Purchase_gatewayOrderId_key" ON "Purchase"("gatewayOrderId");
CREATE UNIQUE INDEX "Purchase_gatewayPaymentId_key" ON "Purchase"("gatewayPaymentId");
CREATE UNIQUE INDEX "Purchase_invoiceNumber_key" ON "Purchase"("invoiceNumber");
CREATE INDEX "Purchase_sellerId_createdAt_idx" ON "Purchase"("sellerId", "createdAt" DESC);
CREATE INDEX "Purchase_status_createdAt_idx" ON "Purchase"("status", "createdAt");

-- ── RefundRequest ────────────────────────────────────────────────────────────
CREATE TABLE "RefundRequest" (
  "id"              TEXT NOT NULL,
  "sellerId"        TEXT NOT NULL,
  "paymentId"       TEXT NOT NULL,
  "status"          "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
  "reason"          TEXT NOT NULL,
  "details"         TEXT,
  "leadsInWindow"   INTEGER NOT NULL DEFAULT 0,
  "amountMinor"     INTEGER NOT NULL,
  "adminNote"       TEXT,
  "reviewedById"    TEXT,
  "reviewedAt"      TIMESTAMP(3),
  "gatewayRefundId" TEXT,
  "requestedById"   TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RefundRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RefundRequest_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RefundRequest_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RefundRequest_gatewayRefundId_key" ON "RefundRequest"("gatewayRefundId");
CREATE INDEX "RefundRequest_status_createdAt_idx" ON "RefundRequest"("status", "createdAt");
CREATE INDEX "RefundRequest_sellerId_createdAt_idx" ON "RefundRequest"("sellerId", "createdAt" DESC);
-- One open request per payment.
CREATE UNIQUE INDEX "RefundRequest_one_open_per_payment" ON "RefundRequest"("paymentId")
  WHERE "status" IN ('REQUESTED', 'APPROVED');

-- ── InvoiceCounter ───────────────────────────────────────────────────────────
CREATE TABLE "InvoiceCounter" (
  "fy"   TEXT NOT NULL,
  "next" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "InvoiceCounter_pkey" PRIMARY KEY ("fy")
);

-- ── Data: the D41 plan ladder ────────────────────────────────────────────────
-- The middle tier becomes "Pro" and gains a subdomain website. Only rows that
-- still carry the old defaults are touched, so an admin's later edits in a
-- re-run environment are not overwritten by name.
UPDATE "Plan" SET "key" = 'pro' WHERE "key" IN ('basic', 'silver')
  AND NOT EXISTS (SELECT 1 FROM "Plan" WHERE "key" = 'pro');

UPDATE "Plan" SET
  "name" = 'Free',
  "description" = 'A free business listing. Direct buyer enquiries on WhatsApp.',
  "priceMinor" = 0, "yearlyPriceMinor" = NULL,
  "leadCreditsPerMonth" = 0, "weeklyLeadQuota" = 5, "dailyLeadQuota" = 0,
  "webPresence" = 'CATALOGUE', "includesPayments" = false, "includesShipping" = false,
  "trustSeal" = false, "searchBoost" = 0, "trialDays" = 0, "sortOrder" = 0
WHERE "key" = 'free';

UPDATE "Plan" SET
  "name" = 'Pro',
  "description" = 'Your own website on bzaro.in and fresh buyer leads every week.',
  "priceMinor" = 99900, "yearlyPriceMinor" = 999900,
  "leadCreditsPerMonth" = 30, "weeklyLeadQuota" = 10, "dailyLeadQuota" = 1,
  "webPresence" = 'SUBDOMAIN', "includesPayments" = false, "includesShipping" = false,
  "trustSeal" = false, "searchBoost" = 10, "trialDays" = 0, "sortOrder" = 1,
  "allowPremiumTemplates" = true
WHERE "key" = 'pro';

UPDATE "Plan" SET
  "name" = 'Gold',
  "description" = 'Your own domain, online orders and shipping included, top placement.',
  "priceMinor" = 299900, "yearlyPriceMinor" = 2500000,
  "leadCreditsPerMonth" = 80, "weeklyLeadQuota" = 20, "dailyLeadQuota" = 1,
  "webPresence" = 'CUSTOM_DOMAIN', "includesPayments" = true, "includesShipping" = true,
  "trustSeal" = true, "searchBoost" = 50, "trialDays" = 0, "sortOrder" = 2,
  "allowPremiumTemplates" = true, "removeBranding" = true, "prioritySupport" = true
WHERE "key" = 'gold';

-- Denormalise the new perks and the new tier onto sellers with a live plan.
UPDATE "Seller" s SET
  "searchBoost" = p."searchBoost",
  "trustSeal"   = p."trustSeal",
  "webPresence" = p."webPresence"
FROM "Subscription" sub
JOIN "Plan" p ON p."id" = sub."planId"
WHERE sub."sellerId" = s."id" AND sub."status" IN ('ACTIVE', 'TRIALING');
