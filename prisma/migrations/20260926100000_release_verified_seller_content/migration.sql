-- Decision D38: the platform verifies the business, not each listing.
-- Data only (no schema change): release content that was waiting for a
-- per-item review, and repair product images left PENDING when their
-- product was approved (the storefront shows APPROVED images only).

UPDATE "Product" AS p
SET "moderationStatus" = 'APPROVED'
FROM "Seller" AS s
WHERE s."id" = p."sellerId"
  AND s."status" = 'VERIFIED'
  AND p."moderationStatus" = 'PENDING';

UPDATE "Service" AS v
SET "moderationStatus" = 'APPROVED'
FROM "Seller" AS s
WHERE s."id" = v."sellerId"
  AND s."status" = 'VERIFIED'
  AND v."moderationStatus" = 'PENDING';

UPDATE "GalleryItem" AS g
SET "moderationStatus" = 'APPROVED'
FROM "Seller" AS s
WHERE s."id" = g."sellerId"
  AND s."status" = 'VERIFIED'
  AND g."moderationStatus" = 'PENDING';

UPDATE "ProductImage" AS i
SET "moderationStatus" = 'APPROVED'
FROM "Product" AS p
WHERE p."id" = i."productId"
  AND p."moderationStatus" = 'APPROVED'
  AND i."moderationStatus" = 'PENDING';
