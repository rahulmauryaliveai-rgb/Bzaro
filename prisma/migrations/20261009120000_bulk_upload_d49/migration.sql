-- D49: bulk product upload — SKU becomes the per-seller identity, plus an
-- import audit table.
--
-- ── The SKU index is the risky half ─────────────────────────────────────────
-- A seller who already used the same product code twice would make
-- CREATE UNIQUE INDEX fail, and this migration abort. That is the intended
-- outcome: the alternative is a migration that renames or drops one of their
-- products, and nobody should discover that after the fact. Run
-- `npm run db:check:sku` BEFORE deploying to find any such rows; the script
-- prints the seller, the code and both products so a human can decide.
--
-- Postgres treats NULLs as distinct in a unique index, so the many products
-- that carry no SKU at all are unaffected.

-- Case-insensitive, because "LED-9W-CW" in the spreadsheet and "led-9w-cw" in
-- a photo file name are the same product (bulk photo matching, D49).
ALTER TABLE "Product" ALTER COLUMN "sku" TYPE CITEXT;

-- Blank strings would all collide with each other under the unique index, and
-- "" has never meant anything other than "no SKU".
UPDATE "Product" SET "sku" = NULL WHERE btrim("sku") = '';

CREATE UNIQUE INDEX "Product_sellerId_sku_key" ON "Product"("sellerId", "sku");

CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED');

CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "createdRows" INTEGER NOT NULL DEFAULT 0,
    "updatedRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImportJob_sellerId_createdAt_idx" ON "ImportJob"("sellerId", "createdAt" DESC);

ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_sellerId_fkey"
    FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;
