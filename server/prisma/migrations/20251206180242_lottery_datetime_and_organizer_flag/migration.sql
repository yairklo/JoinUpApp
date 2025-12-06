-- CreateEnum
CREATE TYPE "public"."ParticipationStatus" AS ENUM ('WAITLISTED', 'CONFIRMED', 'CANCELLED', 'NOT_SELECTED');

-- AlterTable
ALTER TABLE "public"."Game" ADD COLUMN     "lotteryAt" TIMESTAMP(3),
ADD COLUMN     "lotteryEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lotteryExecutedAt" TIMESTAMP(3),
ADD COLUMN     "organizerInLottery" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "public"."Participation" ADD COLUMN     "status" "public"."ParticipationStatus" NOT NULL DEFAULT 'CONFIRMED';
