-- D45: the blog. New tables only (expand-contract safe).

CREATE TYPE "BlogStatus" AS ENUM ('DRAFT', 'PUBLISHED');

CREATE TABLE "BlogAuthor" (
    "id" TEXT NOT NULL,
    "slug" CITEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "bio" TEXT,
    "avatarUrl" TEXT,
    "linkedinUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BlogAuthor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BlogAuthor_slug_key" ON "BlogAuthor"("slug");

CREATE TABLE "BlogPost" (
    "id" TEXT NOT NULL,
    "slug" CITEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "body" TEXT NOT NULL,
    "coverImageUrl" TEXT,
    "coverImageAlt" TEXT,
    "status" "BlogStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "authorId" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "ogImageUrl" TEXT,
    "noindex" BOOLEAN NOT NULL DEFAULT false,
    "canonicalUrl" TEXT,
    "categoryIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "productIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "sellerIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BlogPost_slug_key" ON "BlogPost"("slug");
CREATE INDEX "BlogPost_status_publishedAt_idx" ON "BlogPost"("status", "publishedAt" DESC);
CREATE INDEX "BlogPost_categoryIds_idx" ON "BlogPost" USING GIN ("categoryIds");
CREATE INDEX "BlogPost_authorId_idx" ON "BlogPost"("authorId");

ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "BlogAuthor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A published post always has a publication date.
ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_published_has_date"
  CHECK ("status" <> 'PUBLISHED' OR "publishedAt" IS NOT NULL);
