-- D43: buyer words per category for the post-requirement suggestions.
ALTER TABLE "Category" ADD COLUMN "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE INDEX "Category_keywords_idx" ON "Category" USING GIN ("keywords");
