-- D40: cash on delivery is the seller's own switch, independent of Razorpay.
-- Default on, so a store an admin enables for orders can take COD orders at once.
ALTER TABLE "SellerFeature" ADD COLUMN "codEnabled" BOOLEAN NOT NULL DEFAULT true;
