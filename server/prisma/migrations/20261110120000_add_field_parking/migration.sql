-- Optional parking location for a field (and for a user's field suggestion).
-- Additive and nullable only: no defaults, no backfill, no index.

-- AlterTable
ALTER TABLE "Field" ADD COLUMN "parkingLat" DOUBLE PRECISION,
ADD COLUMN "parkingLng" DOUBLE PRECISION,
ADD COLUMN "parkingNote" TEXT;

-- AlterTable
ALTER TABLE "FieldSuggestion" ADD COLUMN "parkingLat" DOUBLE PRECISION,
ADD COLUMN "parkingLng" DOUBLE PRECISION,
ADD COLUMN "parkingNote" TEXT;
