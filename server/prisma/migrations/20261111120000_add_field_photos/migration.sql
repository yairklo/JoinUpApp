-- Field photo gallery: one row per photo, with a review status and a display order.
-- Additive only. Nothing existing is altered or dropped: "Field"."image" stays as the cover and
-- "Field"."photos" stays in place (no longer read by the app).

-- CreateEnum
CREATE TYPE "FieldPhotoStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "FieldPhoto" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" "FieldPhotoStatus" NOT NULL DEFAULT 'PENDING',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,

    CONSTRAINT "FieldPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FieldPhoto_fieldId_status_sortOrder_idx" ON "FieldPhoto"("fieldId", "status", "sortOrder");

-- CreateIndex
CREATE INDEX "FieldPhoto_uploadedById_status_idx" ON "FieldPhoto"("uploadedById", "status");

-- CreateIndex
CREATE INDEX "FieldPhoto_uploadedById_createdAt_idx" ON "FieldPhoto"("uploadedById", "createdAt");

-- CreateIndex
CREATE INDEX "FieldPhoto_status_createdAt_idx" ON "FieldPhoto"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FieldPhoto_fieldId_url_key" ON "FieldPhoto"("fieldId", "url");

-- AddForeignKey
ALTER TABLE "FieldPhoto" ADD CONSTRAINT "FieldPhoto_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldPhoto" ADD CONSTRAINT "FieldPhoto_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: turn the photos fields already have into gallery rows, all APPROVED.
-- Inserts only (no UPDATE, no DELETE) and idempotent: ids are derived from (fieldId, url) and
-- ON CONFLICT skips anything already present, so running it twice changes nothing.

-- 1. The existing single photo becomes photo number 1 (sortOrder 0).
--    Skipped: the stock placeholder that field creation fills in when no photo was given
--    (server/routes/fields.js, fieldSuggestions.js, gameService.js). It is not a photo of the
--    field, and a field that only has it should show the "add the first photo" invitation.
INSERT INTO "FieldPhoto" ("id", "fieldId", "url", "status", "sortOrder", "createdAt", "reviewedAt")
SELECT
    'fp_' || md5(f."id" || ':' || f."image"),
    f."id",
    f."image",
    'APPROVED'::"FieldPhotoStatus",
    0,
    f."createdAt",
    CURRENT_TIMESTAMP
FROM "Field" f
WHERE f."image" IS NOT NULL
  AND btrim(f."image") <> ''
  AND f."image" NOT LIKE 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b%'
ON CONFLICT ("fieldId", "url") DO NOTHING;

-- 2. The legacy "photos" array follows, in its existing order (sortOrder 1, 2, ...).
--    A URL that is also the cover, or that appears twice, is skipped by the conflict clause.
INSERT INTO "FieldPhoto" ("id", "fieldId", "url", "status", "sortOrder", "createdAt", "reviewedAt")
SELECT
    'fp_' || md5(f."id" || ':' || p."url"),
    f."id",
    p."url",
    'APPROVED'::"FieldPhotoStatus",
    p."ord"::INTEGER,
    f."createdAt",
    CURRENT_TIMESTAMP
FROM "Field" f
CROSS JOIN LATERAL unnest(f."photos") WITH ORDINALITY AS p("url", "ord")
WHERE p."url" IS NOT NULL
  AND btrim(p."url") <> ''
ORDER BY f."id", p."ord"
ON CONFLICT ("fieldId", "url") DO NOTHING;
