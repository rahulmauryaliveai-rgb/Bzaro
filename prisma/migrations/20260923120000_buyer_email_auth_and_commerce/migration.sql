-- ─────────────────────────────────────────────────────────────────────────────
-- Buyer accounts (email + password), storefront commerce, seller integrations
--
-- Replaces the phone-first buyer identity (decision D28) with full buyer
-- accounts on `User`: email + password verified by an email OTP, or Google.
-- `Buyer` is dropped and `Requirement.buyerId` now points at `User`.
--
-- DESTRUCTIVE. Every Requirement — and therefore every Lead, LeadDelivery and
-- LeadFlag — is deleted, because the old rows reference `Buyer` rows that
-- cannot become login-capable accounts: `Buyer` has no password and its email
-- is nullable. This was an explicit decision; see docs/LEADS.md.
--
-- Everything Prisma cannot express — generated tsvector columns, CHECK
-- constraints, partial indexes — is owned by these migration files. Note that
-- `prisma migrate diff` does not see those and will propose dropping them;
-- this file deliberately leaves the searchVector columns and trigram indexes
-- from 20260910170000_init and 20260917120000_leads_discovery untouched.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Drop the data that cannot be carried across ───────────────────────────

-- Cascades to Lead, and from Lead to LeadDelivery and LeadFlag.
-- CreditLedger.leadId is ON DELETE SET NULL, so the ledger — and every
-- seller's credit balance — survives intact.
DELETE FROM "Requirement";

-- The enum rewrite below casts through text and would fail on any surviving
-- BUYER_CONTACT row.
DELETE FROM "OtpChallenge" WHERE "purpose" = 'BUYER_CONTACT';

-- ── 2. Enums ─────────────────────────────────────────────────────────────────

CREATE TYPE "EmailOtpPurpose" AS ENUM ('SIGNUP', 'RESET_PASSWORD');
CREATE TYPE "RequirementTrigger" AS ENUM ('CALL', 'WHATSAPP', 'ENQUIRY', 'SEARCH_CARD');
CREATE TYPE "RequirementSource" AS ENUM ('BZARO_MARKETPLACE', 'STOREFRONT');
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');
CREATE TYPE "ShippingStatus" AS ENUM ('NOT_SHIPPED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'RETURNED', 'CANCELLED');
CREATE TYPE "IntegrationType" AS ENUM ('RAZORPAY', 'SHIPROCKET');
CREATE TYPE "IntegrationMode" AS ENUM ('TEST', 'LIVE');
CREATE TYPE "FeatureSource" AS ENUM ('PLAN', 'ADDON', 'ADMIN_OVERRIDE');

-- Seller progress markers after acceptance. CLOSED and EXPIRED stay: the
-- expiry sweeper and the flag/refund rules are built on them.
ALTER TYPE "LeadStatus" ADD VALUE 'CONTACTED';
ALTER TYPE "LeadStatus" ADD VALUE 'WON';
ALTER TYPE "LeadStatus" ADD VALUE 'LOST';

-- Buyers no longer verify a phone; only seller onboarding does.
CREATE TYPE "OtpPurpose_new" AS ENUM ('SELLER_SIGNUP');
ALTER TABLE "OtpChallenge" ALTER COLUMN "purpose" TYPE "OtpPurpose_new" USING ("purpose"::text::"OtpPurpose_new");
ALTER TYPE "OtpPurpose" RENAME TO "OtpPurpose_old";
ALTER TYPE "OtpPurpose_new" RENAME TO "OtpPurpose";
DROP TYPE "public"."OtpPurpose_old";

-- ── 3. Retire the phone-first buyer identity ─────────────────────────────────

ALTER TABLE "Buyer" DROP CONSTRAINT "Buyer_locationId_fkey";
ALTER TABLE "Buyer" DROP CONSTRAINT "Buyer_userId_fkey";
ALTER TABLE "Requirement" DROP CONSTRAINT "Requirement_buyerId_fkey";

DROP TABLE "Buyer";

-- `buyerId` keeps its name — it is still the buyer — but now references User.
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_buyerId_fkey"
  FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 4. Requirement: consent, attribution and business details ────────────────
-- NOT NULL without a default is safe: the table was emptied in step 1.

ALTER TABLE "Requirement"
  ADD COLUMN "businessName"   TEXT,
  ADD COLUMN "gstin"          TEXT,
  ADD COLUMN "pincode"        TEXT,
  ADD COLUMN "trigger"        "RequirementTrigger" NOT NULL,
  ADD COLUMN "source"         "RequirementSource" NOT NULL,
  ADD COLUMN "refBzaro"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "consentVersion" TEXT NOT NULL,
  ADD COLUMN "consentAt"      TIMESTAMP(3) NOT NULL;

-- ── 5. Buyer accounts ────────────────────────────────────────────────────────

CREATE TABLE "BuyerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "locationId" TEXT,
    "pincode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuyerProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BuyerProfile_userId_key" ON "BuyerProfile"("userId");
CREATE INDEX "BuyerProfile_locationId_idx" ON "BuyerProfile"("locationId");

ALTER TABLE "BuyerProfile" ADD CONSTRAINT "BuyerProfile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuyerProfile" ADD CONSTRAINT "BuyerProfile_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "EmailOtp" (
    "id" TEXT NOT NULL,
    "email" CITEXT NOT NULL,
    "purpose" "EmailOtpPurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailOtp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailOtp_email_purpose_createdAt_idx" ON "EmailOtp"("email", "purpose", "createdAt" DESC);
CREATE INDEX "EmailOtp_expiresAt_idx" ON "EmailOtp"("expiresAt");

-- ── 6. Geography: PIN codes ──────────────────────────────────────────────────

CREATE TABLE "Pincode" (
    "pincode" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "district" TEXT,
    "state" TEXT NOT NULL,
    "locationId" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,

    CONSTRAINT "Pincode_pkey" PRIMARY KEY ("pincode")
);

CREATE INDEX "Pincode_city_idx" ON "Pincode"("city");
CREATE INDEX "Pincode_locationId_idx" ON "Pincode"("locationId");

ALTER TABLE "Pincode" ADD CONSTRAINT "Pincode_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 7. Commerce ──────────────────────────────────────────────────────────────

CREATE TABLE "Cart" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Cart_sellerId_buyerId_key" ON "Cart"("sellerId", "buyerId");
CREATE INDEX "Cart_buyerId_idx" ON "Cart"("buyerId");

CREATE TABLE "CartItem" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CartItem_cartId_productId_key" ON "CartItem"("cartId", "productId");
CREATE INDEX "CartItem_cartId_idx" ON "CartItem"("cartId");

CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "subtotalMinor" INTEGER NOT NULL,
    "shippingMinor" INTEGER NOT NULL DEFAULT 0,
    "taxMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paymentMethod" TEXT,
    "razorpayOrderId" TEXT,
    "razorpayPaymentId" TEXT,
    "shippingStatus" "ShippingStatus" NOT NULL DEFAULT 'NOT_SHIPPED',
    "shiprocketOrderId" TEXT,
    "awb" TEXT,
    "trackingUrl" TEXT,
    "shippingAddress" JSONB NOT NULL,
    "buyerName" TEXT NOT NULL,
    "buyerEmail" CITEXT,
    "buyerPhone" TEXT,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
CREATE UNIQUE INDEX "Order_razorpayOrderId_key" ON "Order"("razorpayOrderId");
CREATE UNIQUE INDEX "Order_razorpayPaymentId_key" ON "Order"("razorpayPaymentId");
CREATE INDEX "Order_sellerId_createdAt_idx" ON "Order"("sellerId", "createdAt" DESC);
CREATE INDEX "Order_sellerId_status_createdAt_idx" ON "Order"("sellerId", "status", "createdAt" DESC);
CREATE INDEX "Order_buyerId_createdAt_idx" ON "Order"("buyerId", "createdAt" DESC);
CREATE INDEX "Order_paymentStatus_createdAt_idx" ON "Order"("paymentStatus", "createdAt");

CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

CREATE TABLE "DemandAlert" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantityBand" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemandAlert_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DemandAlert_sellerId_readAt_idx" ON "DemandAlert"("sellerId", "readAt");
CREATE INDEX "DemandAlert_sellerId_createdAt_idx" ON "DemandAlert"("sellerId", "createdAt" DESC);

ALTER TABLE "Cart" ADD CONSTRAINT "Cart_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_buyerId_fkey"
  FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey"
  FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_buyerId_fkey"
  FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DemandAlert" ADD CONSTRAINT "DemandAlert_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DemandAlert" ADD CONSTRAINT "DemandAlert_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DemandAlert" ADD CONSTRAINT "DemandAlert_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 8. Seller integrations and feature flags ─────────────────────────────────

CREATE TABLE "SellerIntegration" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "type" "IntegrationType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "mode" "IntegrationMode" NOT NULL DEFAULT 'TEST',
    "encryptedConfig" TEXT NOT NULL,
    "configHint" JSONB,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastTestError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerIntegration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SellerIntegration_sellerId_type_key" ON "SellerIntegration"("sellerId", "type");

CREATE TABLE "SellerFeature" (
    "sellerId" TEXT NOT NULL,
    "paymentsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "shippingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "source" "FeatureSource" NOT NULL DEFAULT 'PLAN',
    "note" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerFeature_pkey" PRIMARY KEY ("sellerId")
);

ALTER TABLE "SellerIntegration" ADD CONSTRAINT "SellerIntegration_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SellerFeature" ADD CONSTRAINT "SellerFeature_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 9. Invariants Prisma cannot express ──────────────────────────────────────

ALTER TABLE "EmailOtp"
  ADD CONSTRAINT "EmailOtp_attempts_range"
  CHECK ("attempts" BETWEEN 0 AND "maxAttempts");

-- India Post format: six digits, never leading zero.
ALTER TABLE "Pincode"
  ADD CONSTRAINT "Pincode_format"
  CHECK ("pincode" ~ '^[1-9][0-9]{5}$');

ALTER TABLE "CartItem"
  ADD CONSTRAINT "CartItem_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "CartItem"
  ADD CONSTRAINT "CartItem_price_non_negative" CHECK ("priceMinor" >= 0);

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_money_non_negative"
  CHECK ("unitPriceMinor" >= 0 AND "totalMinor" >= 0);

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_money_non_negative"
  CHECK ("subtotalMinor" >= 0 AND "shippingMinor" >= 0 AND "taxMinor" >= 0 AND "totalMinor" >= 0);

-- A paid order must record how it was paid.
ALTER TABLE "Order"
  ADD CONSTRAINT "Order_paid_has_method"
  CHECK ("paymentStatus" <> 'PAID' OR "paymentMethod" IS NOT NULL);
