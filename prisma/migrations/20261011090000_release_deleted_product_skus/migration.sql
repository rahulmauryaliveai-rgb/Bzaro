-- D49 follow-up: a soft-deleted product must not hold its SKU hostage.
--
-- ── The bug this fixes ──────────────────────────────────────────────────────
-- `UNIQUE (sellerId, sku)` (migration 20261009120000) has no idea what
-- `deletedAt` means, so a deleted product still occupies its product code. The
-- seller then cannot reuse it: re-importing that SKU fails with "a product
-- with this code already exists", naming a product they deleted and can no
-- longer see anywhere in the dashboard.
--
-- Deleting a product and re-adding it under the same code is ordinary — a
-- seller tidying up, or fixing a bad import by deleting and re-uploading. So
-- the code is released.
--
-- `deleteCatalogItem` now clears `sku` as part of the soft delete, which covers
-- everything from here on. This statement is the backfill for rows deleted
-- BEFORE that change shipped.
--
-- ── Why this is safe ────────────────────────────────────────────────────────
-- Nothing reads a deleted product's SKU. `OrderItem` carries its own nullable
-- `sku` column — a snapshot, which exists precisely so an order survives the
-- product being deleted — and the Shiprocket payload is built from
-- `productId` (src/server/services/shipping.service.ts). Every catalogue and
-- marketplace query filters `deletedAt IS NULL`, so no public or dashboard
-- surface can reach one of these rows.
--
-- Not reversible, and deliberately so: the whole point is that the old value
-- stops being reserved. The products themselves are untouched — this writes
-- one nullable column on rows that are already deleted.

UPDATE "Product"
   SET "sku" = NULL
 WHERE "deletedAt" IS NOT NULL
   AND "sku" IS NOT NULL;
