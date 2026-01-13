-- CreateEnum
CREATE TYPE "public"."SportType" AS ENUM ('SOCCER', 'BASKETBALL', 'TENNIS');

-- DropForeignKey
ALTER TABLE "public"."SeriesParticipant" DROP CONSTRAINT "SeriesParticipant_seriesId_fkey";

-- DropForeignKey
ALTER TABLE "public"."SeriesParticipant" DROP CONSTRAINT "SeriesParticipant_userId_fkey";

-- AlterTable
ALTER TABLE "public"."Field" ADD COLUMN     "supportedSports" "public"."SportType"[] DEFAULT ARRAY['SOCCER']::"public"."SportType"[];

-- AlterTable
ALTER TABLE "public"."Game" ADD COLUMN     "registrationOpensAt" TIMESTAMP(3),
ADD COLUMN     "sport" "public"."SportType" NOT NULL DEFAULT 'SOCCER',
ADD COLUMN     "title" TEXT;

-- AlterTable
ALTER TABLE "public"."GameSeries" ADD COLUMN     "autoOpenRegistrationHours" DOUBLE PRECISION,
ADD COLUMN     "sport" "public"."SportType" NOT NULL DEFAULT 'SOCCER',
ADD COLUMN     "title" TEXT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."SeriesParticipant" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "public"."SeriesParticipant" ADD CONSTRAINT "SeriesParticipant_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "public"."GameSeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SeriesParticipant" ADD CONSTRAINT "SeriesParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
