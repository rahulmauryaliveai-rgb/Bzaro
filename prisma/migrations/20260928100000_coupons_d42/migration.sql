-- D42: coupons — plan passes (e.g. Pro 3 months for ₹1) and discounts.
-- Additive only.

ALTER TYPE "AddonKind" ADD VALUE IF NOT EXISTS 'PLAN_PASS';
CREATE TYPE "CouponKind" AS ENUM ('PLAN_PASS', 'PERCENT_OFF', 'FLAT_OFF');

ALTER TABLE "Subscription"
  ADD COLUMN "expiresAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "couponId" TEXT;

-- A pass can cost ₹0 (a free coupon) or ₹1, so the taxable value may be 0.
ALTER TABLE "Purchase" DROP CONSTRAINT IF EXISTS "Purchase_amounts_check";
ALTER TABLE "Purchase"
  ADD COLUMN "couponId" TEXT,
  ADD COLUMN "discountMinor" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "planId" TEXT,
  ADD COLUMN "passMonths" INTEGER,
  ADD CONSTRAINT "Purchase_amounts_check" CHECK ("totalMinor" = "baseMinor" + "taxMinor" AND "baseMinor" >= 0 AND "discountMinor" >= 0);

CREATE TABLE "Coupon" (
  "id"              TEXT NOT NULL,
  "code"            CITEXT NOT NULL,
  "description"     TEXT,
  "kind"            "CouponKind" NOT NULL,
  "planId"          TEXT,
  "passMonths"      INTEGER,
  "passPriceMinor"  INTEGER,
  "percentOff"      INTEGER,
  "amountOffMinor"  INTEGER,
  "appliesTo"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "planKeys"        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "startsAt"        TIMESTAMP(3),
  "endsAt"          TIMESTAMP(3),
  "maxRedemptions"  INTEGER,
  "perSellerLimit"  INTEGER NOT NULL DEFAULT 1,
  "newSellersOnly"  BOOLEAN NOT NULL DEFAULT false,
  "isActive"        BOOLEAN NOT NULL DEFAULT true,
  "redemptionCount" INTEGER NOT NULL DEFAULT 0,
  "createdById"     TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Coupon_shape_check" CHECK (
    ("kind" = 'PLAN_PASS' AND "planId" IS NOT NULL AND "passMonths" BETWEEN 1 AND 36 AND "passPriceMinor" >= 0)
    OR ("kind" = 'PERCENT_OFF' AND "percentOff" BETWEEN 1 AND 100)
    OR ("kind" = 'FLAT_OFF' AND "amountOffMinor" > 0)
  )
);
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");
CREATE INDEX "Coupon_isActive_endsAt_idx" ON "Coupon"("isActive", "endsAt");

CREATE TABLE "CouponRedemption" (
  "id"             TEXT NOT NULL,
  "couponId"       TEXT NOT NULL,
  "sellerId"       TEXT NOT NULL,
  "purchaseId"     TEXT,
  "subscriptionId" TEXT,
  "discountMinor"  INTEGER NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CouponRedemption_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CouponRedemption_purchaseId_key" ON "CouponRedemption"("purchaseId");
CREATE UNIQUE INDEX "CouponRedemption_subscriptionId_key" ON "CouponRedemption"("subscriptionId");
CREATE INDEX "CouponRedemption_couponId_createdAt_idx" ON "CouponRedemption"("couponId", "createdAt" DESC);
CREATE INDEX "CouponRedemption_sellerId_couponId_idx" ON "CouponRedemption"("sellerId", "couponId");

ALTER TABLE "Purchase"
  ADD CONSTRAINT "Purchase_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
