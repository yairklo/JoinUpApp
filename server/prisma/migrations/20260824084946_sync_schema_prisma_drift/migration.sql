/*
  Warnings:

  - You are about to drop the `_orphaned_GameSeries_backup` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_orphaned_SeriesParticipant_backup` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "PrivacyLevel" AS ENUM ('EVERYONE', 'FRIENDS_ONLY');

-- CreateEnum
CREATE TYPE "SeriesRoleType" AS ENUM ('MEMBER', 'MANAGER');

-- AlterTable
ALTER TABLE "Game" ALTER COLUMN "duration" SET DEFAULT 1,
ALTER COLUMN "duration" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Participation" ADD COLUMN     "isCaptain" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SeriesParticipant" ADD COLUMN     "role" "SeriesRoleType" NOT NULL DEFAULT 'MEMBER';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "privacyFriends" "PrivacyLevel",
ADD COLUMN     "privacyGames" "PrivacyLevel",
ADD COLUMN     "privacyMessages" "PrivacyLevel";

-- DropTable
DROP TABLE "_orphaned_GameSeries_backup";

-- DropTable
DROP TABLE "_orphaned_SeriesParticipant_backup";

-- CreateTable
CREATE TABLE "FieldReport" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "userId" TEXT,
    "dayOfWeek" INTEGER NOT NULL,
    "hour" INTEGER NOT NULL,
    "busyLevel" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRating" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FieldReport_fieldId_dayOfWeek_hour_idx" ON "FieldReport"("fieldId", "dayOfWeek", "hour");

-- CreateIndex
CREATE INDEX "FieldReport_fieldId_userId_createdAt_idx" ON "FieldReport"("fieldId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "UserRating_targetId_idx" ON "UserRating"("targetId");

-- CreateIndex
CREATE INDEX "UserRating_gameId_raterId_idx" ON "UserRating"("gameId", "raterId");

-- CreateIndex
CREATE UNIQUE INDEX "UserRating_gameId_raterId_targetId_key" ON "UserRating"("gameId", "raterId", "targetId");

-- CreateIndex
CREATE INDEX "Field_lat_lng_idx" ON "Field"("lat", "lng");

-- CreateIndex
CREATE INDEX "Field_available_lat_lng_idx" ON "Field"("available", "lat", "lng");

-- CreateIndex
CREATE INDEX "Game_start_status_idx" ON "Game"("start", "status");

-- CreateIndex
CREATE INDEX "Game_sport_idx" ON "Game"("sport");

-- CreateIndex
CREATE INDEX "Game_fieldId_idx" ON "Game"("fieldId");

-- CreateIndex
CREATE INDEX "Game_organizerId_idx" ON "Game"("organizerId");

-- CreateIndex
CREATE INDEX "Game_customLat_customLng_idx" ON "Game"("customLat", "customLng");

-- CreateIndex
CREATE INDEX "Message_chatRoomId_idx" ON "Message"("chatRoomId");

-- AddForeignKey
ALTER TABLE "FieldReport" ADD CONSTRAINT "FieldReport_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRating" ADD CONSTRAINT "UserRating_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRating" ADD CONSTRAINT "UserRating_raterId_fkey" FOREIGN KEY ("raterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRating" ADD CONSTRAINT "UserRating_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
