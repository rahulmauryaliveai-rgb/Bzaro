-- D44: admin-editable SEO fields. Additive only (expand-contract safe).

ALTER TABLE "Category"
  ADD COLUMN "faqs" JSONB,
  ADD COLUMN "noindex" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ogImageUrl" TEXT;

ALTER TABLE "Seller"
  ADD COLUMN "seoNoindex" BOOLEAN NOT NULL DEFAULT false;
