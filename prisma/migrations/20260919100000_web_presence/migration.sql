-- Decision D32: web presence is a plan tier, not a per-seller flag.
CREATE TYPE "WebPresence" AS ENUM ('CATALOGUE', 'SUBDOMAIN', 'CUSTOM_DOMAIN');

ALTER TABLE "Plan" ADD COLUMN "webPresence" "WebPresence" NOT NULL DEFAULT 'CATALOGUE';
-- Carry the old flag across: a plan that allowed a custom domain is the top tier.
UPDATE "Plan" SET "webPresence" = 'CUSTOM_DOMAIN' WHERE "allowCustomDomain" = true;
ALTER TABLE "Plan" DROP COLUMN "allowCustomDomain";

ALTER TABLE "Seller" ADD COLUMN "webPresence" "WebPresence" NOT NULL DEFAULT 'CATALOGUE';

-- Backfill from each seller's live subscription (same rule as recomputeWebPresence).
UPDATE "Seller" s
SET "webPresence" = p."webPresence"
FROM "Subscription" sub
JOIN "Plan" p ON p."id" = sub."planId"
WHERE sub."sellerId" = s."id"
  AND (
    sub."status" IN ('ACTIVE', 'TRIALING')
    OR (sub."status" = 'PAST_DUE' AND sub."gracePeriodEndsAt" > now())
  )
  AND sub."currentPeriodEnd" = (
    SELECT max(s2."currentPeriodEnd") FROM "Subscription" s2
    WHERE s2."sellerId" = s."id"
      AND (s2."status" IN ('ACTIVE', 'TRIALING')
           OR (s2."status" = 'PAST_DUE' AND s2."gracePeriodEndsAt" > now()))
  );

CREATE INDEX "Seller_webPresence_idx" ON "Seller"("webPresence");

-- The middle tier is "Basic" from here on (the plan sellers can buy without a website).
UPDATE "Plan" SET "key" = 'basic', "name" = 'Basic' WHERE "key" = 'silver' AND NOT EXISTS (SELECT 1 FROM "Plan" WHERE "key" = 'basic');
