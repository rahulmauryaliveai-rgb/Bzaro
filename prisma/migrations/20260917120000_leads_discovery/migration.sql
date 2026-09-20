-- ─────────────────────────────────────────────────────────────────────────────
-- Buyer discovery + lead system (docs/LEADS.md)
--
-- Adds phone-first buyers, OTP challenges, requirements, DIRECT/MARKET leads,
-- the delivery outbox, seller service areas, the credit ledger and lead flags;
-- extends Seller with onboarding + matching fields and Location with a metro
-- cluster key.
--
-- The first section is the output of `prisma migrate diff`. The section after
-- "Beyond Prisma's schema language" is hand-written.
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('MANUFACTURER', 'WHOLESALER', 'DISTRIBUTOR', 'TRADER', 'RETAILER', 'SERVICE_PROVIDER', 'EXPORTER');

-- CreateEnum
CREATE TYPE "OnboardingStep" AS ENUM ('ACCOUNT', 'BUSINESS', 'TRUST', 'CATALOG', 'COMPLETE');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('BUYER_CONTACT', 'SELLER_SIGNUP');

-- CreateEnum
CREATE TYPE "RequirementTimeline" AS ENUM ('IMMEDIATE', 'WITHIN_WEEK', 'WITHIN_MONTH', 'EXPLORING');

-- CreateEnum
CREATE TYPE "RequirementPurpose" AS ENUM ('RESALE', 'BUSINESS_USE', 'PERSONAL_USE');

-- CreateEnum
CREATE TYPE "FanoutStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "LeadType" AS ENUM ('DIRECT', 'MARKET');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'VIEWED', 'ACCEPTED', 'CLOSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "LeadChannel" AS ENUM ('PANEL', 'WHATSAPP', 'EMAIL');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "CreditReason" AS ENUM ('MONTHLY_GRANT', 'LEAD_ACCEPT', 'FLAG_REFUND', 'ADMIN_ADJUST');

-- CreateEnum
CREATE TYPE "LeadFlagReason" AS ENUM ('UNREACHABLE', 'WRONG_CATEGORY', 'WRONG_CITY', 'DUPLICATE', 'SPAM', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadFlagStatus" AS ENUM ('OPEN', 'REFUNDED', 'REJECTED');

-- DropIndex
DROP INDEX "SellerCategory_categoryId_idx";

-- AlterTable
ALTER TABLE "Seller" ADD COLUMN     "annualTurnover" TEXT,
ADD COLUMN     "businessType" "BusinessType",
ADD COLUMN     "certifications" TEXT[],
ADD COLUMN     "creditBalance" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "gstinVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "leadsAccepted" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "leadsReceived" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "onboardingStep" "OnboardingStep" NOT NULL DEFAULT 'ACCOUNT',
ADD COLUMN     "responseRate" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "SellerCategory" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "clusterKey" TEXT;

-- CreateTable
CREATE TABLE "SellerServiceArea" (
    "sellerId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SellerServiceArea_pkey" PRIMARY KEY ("sellerId","locationId")
);

-- CreateTable
CREATE TABLE "Buyer" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phoneVerifiedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT,
    "email" CITEXT,
    "company" TEXT,
    "locationId" TEXT,
    "userId" TEXT,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Buyer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpChallenge" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Requirement" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "productId" TEXT,
    "directSellerId" TEXT,
    "categoryId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "quantityUnit" TEXT NOT NULL,
    "timeline" "RequirementTimeline" NOT NULL,
    "purpose" "RequirementPurpose" NOT NULL,
    "notes" TEXT,
    "fingerprint" TEXT NOT NULL,
    "fanoutStatus" "FanoutStatus" NOT NULL DEFAULT 'PENDING',
    "fanoutAttempts" INTEGER NOT NULL DEFAULT 0,
    "fanoutAt" TIMESTAMP(3),
    "fanoutError" TEXT,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Requirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "type" "LeadType" NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "masked" BOOLEAN NOT NULL,
    "score" INTEGER,
    "rank" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "acceptedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "sellerNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadDelivery" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "channel" "LeadChannel" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "providerMessageId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditLedger" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" "CreditReason" NOT NULL,
    "leadId" TEXT,
    "leadFlagId" TEXT,
    "subscriptionId" TEXT,
    "periodKey" TEXT,
    "note" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadFlag" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "reason" "LeadFlagReason" NOT NULL,
    "note" TEXT,
    "status" "LeadFlagStatus" NOT NULL DEFAULT 'OPEN',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "refundLedgerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SellerServiceArea_locationId_idx" ON "SellerServiceArea"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "Buyer_phone_key" ON "Buyer"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Buyer_userId_key" ON "Buyer"("userId");

-- CreateIndex
CREATE INDEX "Buyer_createdAt_idx" ON "Buyer"("createdAt");

-- CreateIndex
CREATE INDEX "OtpChallenge_phone_purpose_createdAt_idx" ON "OtpChallenge"("phone", "purpose", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "OtpChallenge_expiresAt_idx" ON "OtpChallenge"("expiresAt");

-- CreateIndex
CREATE INDEX "Requirement_fanoutStatus_createdAt_idx" ON "Requirement"("fanoutStatus", "createdAt");

-- CreateIndex
CREATE INDEX "Requirement_buyerId_fingerprint_createdAt_idx" ON "Requirement"("buyerId", "fingerprint", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Requirement_buyerId_createdAt_idx" ON "Requirement"("buyerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Requirement_categoryId_locationId_createdAt_idx" ON "Requirement"("categoryId", "locationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Lead_sellerId_status_createdAt_idx" ON "Lead"("sellerId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Lead_sellerId_type_status_createdAt_idx" ON "Lead"("sellerId", "type", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Lead_status_expiresAt_idx" ON "Lead"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Lead_requirementId_idx" ON "Lead"("requirementId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_requirementId_sellerId_key" ON "Lead"("requirementId", "sellerId");

-- CreateIndex
CREATE INDEX "LeadDelivery_status_createdAt_idx" ON "LeadDelivery"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LeadDelivery_leadId_channel_key" ON "LeadDelivery"("leadId", "channel");

-- CreateIndex
CREATE INDEX "CreditLedger_sellerId_createdAt_idx" ON "CreditLedger"("sellerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "CreditLedger_leadId_idx" ON "CreditLedger"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditLedger_sellerId_reason_periodKey_key" ON "CreditLedger"("sellerId", "reason", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "LeadFlag_leadId_key" ON "LeadFlag"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadFlag_refundLedgerId_key" ON "LeadFlag"("refundLedgerId");

-- CreateIndex
CREATE INDEX "LeadFlag_status_createdAt_idx" ON "LeadFlag"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "LeadFlag_sellerId_createdAt_idx" ON "LeadFlag"("sellerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Seller_status_responseRate_idx" ON "Seller"("status", "responseRate" DESC);

-- CreateIndex
CREATE INDEX "SellerCategory_categoryId_isPrimary_idx" ON "SellerCategory"("categoryId", "isPrimary");

-- CreateIndex
CREATE INDEX "Location_clusterKey_idx" ON "Location"("clusterKey");

-- AddForeignKey
ALTER TABLE "SellerServiceArea" ADD CONSTRAINT "SellerServiceArea_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerServiceArea" ADD CONSTRAINT "SellerServiceArea_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Buyer" ADD CONSTRAINT "Buyer_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Buyer" ADD CONSTRAINT "Buyer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Buyer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadDelivery" ADD CONSTRAINT "LeadDelivery_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedger" ADD CONSTRAINT "CreditLedger_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedger" ADD CONSTRAINT "CreditLedger_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedger" ADD CONSTRAINT "CreditLedger_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadFlag" ADD CONSTRAINT "LeadFlag_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadFlag" ADD CONSTRAINT "LeadFlag_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;




-- ═════════════════════════════════════════════════════════════════════════════
-- Beyond Prisma's schema language
-- ═════════════════════════════════════════════════════════════════════════════

-- ── Full-text search on Seller ───────────────────────────────────────────────
-- Discovery pages list suppliers, not only products, so the seller record needs
-- the same STORED tsvector treatment Product and Service already have.
ALTER TABLE "Seller" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("businessName", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("tagline", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'D')
  ) STORED;

CREATE INDEX "Seller_searchVector_idx" ON "Seller" USING GIN ("searchVector");

-- Category lookup from the homepage search box: "led bulb" → LED Lighting.
CREATE INDEX "Category_name_trgm_idx" ON "Category" USING GIN ("name" gin_trgm_ops);

-- ── Invariants the application must never be able to break ──────────────────

-- attempts can never exceed maxAttempts: the verify path increments under a
-- row lock, and this makes a race that slips past it a constraint error
-- instead of a fourth guess.
ALTER TABLE "OtpChallenge"
  ADD CONSTRAINT "OtpChallenge_attempts_range"
  CHECK ("attempts" BETWEEN 0 AND "maxAttempts");

ALTER TABLE "Requirement"
  ADD CONSTRAINT "Requirement_quantity_positive" CHECK ("quantity" > 0);

-- A MARKET lead without an expiry would never be swept; a masked DIRECT lead
-- would hide a number the buyer explicitly chose to share.
ALTER TABLE "Lead"
  ADD CONSTRAINT "Lead_market_has_expiry"
  CHECK ("type" <> 'MARKET' OR "expiresAt" IS NOT NULL);

ALTER TABLE "Lead"
  ADD CONSTRAINT "Lead_direct_never_masked"
  CHECK ("type" <> 'DIRECT' OR "masked" = false);

ALTER TABLE "Seller"
  ADD CONSTRAINT "Seller_responseRate_range"
  CHECK ("responseRate" IS NULL OR ("responseRate" >= 0 AND "responseRate" <= 1));

-- The ledger debits inside a transaction that re-reads the balance; this is
-- the backstop so two concurrent accepts can never drive a seller negative.
ALTER TABLE "Seller"
  ADD CONSTRAINT "Seller_creditBalance_non_negative" CHECK ("creditBalance" >= 0);

ALTER TABLE "CreditLedger"
  ADD CONSTRAINT "CreditLedger_delta_non_zero" CHECK ("delta" <> 0);

ALTER TABLE "CreditLedger"
  ADD CONSTRAINT "CreditLedger_balanceAfter_non_negative" CHECK ("balanceAfter" >= 0);

-- ── Partial indexes for the worker's hot queries ─────────────────────────────
-- The worker polls for PENDING rows every few seconds. Once the platform has
-- a million requirements, nearly all of them are DONE; a partial index keeps
-- the poll reading a handful of pages instead of the whole status index.
CREATE INDEX "Requirement_fanout_pending_idx"
  ON "Requirement" ("createdAt") WHERE "fanoutStatus" = 'PENDING';

CREATE INDEX "LeadDelivery_pending_idx"
  ON "LeadDelivery" ("createdAt") WHERE "status" = 'PENDING';

-- Expiry sweep touches only open MARKET leads.
CREATE INDEX "Lead_open_market_expiry_idx"
  ON "Lead" ("expiresAt") WHERE "type" = 'MARKET' AND "status" IN ('NEW', 'VIEWED');
