-- CreateEnum safely (Only if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SportType') THEN
        CREATE TYPE "public"."SportType" AS ENUM ('SOCCER', 'BASKETBALL', 'TENNIS');
    END IF;
END$$;

-- DropForeignKey safely
ALTER TABLE "public"."SeriesParticipant" DROP CONSTRAINT IF EXISTS "SeriesParticipant_seriesId_fkey";

-- DropForeignKey safely
ALTER TABLE "public"."SeriesParticipant" DROP CONSTRAINT IF EXISTS "SeriesParticipant_userId_fkey";

-- AlterTable: Field
ALTER TABLE "public"."Field" ADD COLUMN IF NOT EXISTS "supportedSports" "public"."SportType"[] DEFAULT ARRAY['SOCCER']::"public"."SportType"[];

-- AlterTable: Game (Split into separate safe commands)
ALTER TABLE "public"."Game" ADD COLUMN IF NOT EXISTS "registrationOpensAt" TIMESTAMP(3);
ALTER TABLE "public"."Game" ADD COLUMN IF NOT EXISTS "sport" "public"."SportType" NOT NULL DEFAULT 'SOCCER';
ALTER TABLE "public"."Game" ADD COLUMN IF NOT EXISTS "title" TEXT;

-- AlterTable: GameSeries (Split into separate safe commands)
ALTER TABLE "public"."GameSeries" ADD COLUMN IF NOT EXISTS "autoOpenRegistrationHours" DOUBLE PRECISION;
ALTER TABLE "public"."GameSeries" ADD COLUMN IF NOT EXISTS "sport" "public"."SportType" NOT NULL DEFAULT 'SOCCER';
ALTER TABLE "public"."GameSeries" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "public"."GameSeries" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable: SeriesParticipant
ALTER TABLE "public"."SeriesParticipant" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable: User
ALTER TABLE "public"."User" ADD COLUMN IF NOT EXISTS "age" INTEGER;

-- AlterTable: UserSport
ALTER TABLE "public"."UserSport" ADD COLUMN IF NOT EXISTS "positionDescription" TEXT;

-- AddForeignKey (Re-add constraints)
-- We wrap these in a DO block to avoid "already exists" errors if the DROP failed silently or race conditions occurred
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SeriesParticipant_seriesId_fkey') THEN
        ALTER TABLE "public"."SeriesParticipant" ADD CONSTRAINT "SeriesParticipant_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "public"."GameSeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SeriesParticipant_userId_fkey') THEN
        ALTER TABLE "public"."SeriesParticipant" ADD CONSTRAINT "SeriesParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END$$;