-- AlterTable: Field
ALTER TABLE "public"."Field" ADD COLUMN IF NOT EXISTS "supportedSports" "public"."SportType"[] DEFAULT ARRAY['SOCCER']::"public"."SportType"[];

-- AlterTable: Game
ALTER TABLE "public"."Game" ADD COLUMN IF NOT EXISTS "registrationOpensAt" TIMESTAMP(3);
ALTER TABLE "public"."Game" ADD COLUMN IF NOT EXISTS "sport" "public"."SportType" NOT NULL DEFAULT 'SOCCER';
ALTER TABLE "public"."Game" ADD COLUMN IF NOT EXISTS "title" TEXT;

-- AlterTable: GameSeries
ALTER TABLE "public"."GameSeries" ADD COLUMN IF NOT EXISTS "autoOpenRegistrationHours" DOUBLE PRECISION;
ALTER TABLE "public"."GameSeries" ADD COLUMN IF NOT EXISTS "sport" "public"."SportType" NOT NULL DEFAULT 'SOCCER';
ALTER TABLE "public"."GameSeries" ADD COLUMN IF NOT EXISTS "title" TEXT;

-- Note: We skipped CREATE TYPE because it already exists.
-- We skipped FK constraints to avoid conflicts with existing constraints from production.