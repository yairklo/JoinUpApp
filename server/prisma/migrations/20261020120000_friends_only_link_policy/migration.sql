-- CreateEnum
CREATE TYPE "FriendsOnlyLinkPolicy" AS ENUM ('REQUEST_TO_JOIN', 'BLOCKED');

-- CreateEnum
CREATE TYPE "SeriesJoinRequestStatus" AS ENUM ('PENDING', 'REJECTED');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "friendsOnlyLinkPolicy" "FriendsOnlyLinkPolicy" NOT NULL DEFAULT 'REQUEST_TO_JOIN';

-- AlterTable
ALTER TABLE "GameSeries" ADD COLUMN     "friendsOnlyLinkPolicy" "FriendsOnlyLinkPolicy" NOT NULL DEFAULT 'REQUEST_TO_JOIN';

-- CreateTable
CREATE TABLE "SeriesJoinRequest" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "SeriesJoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeriesJoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeriesJoinRequest_seriesId_status_idx" ON "SeriesJoinRequest"("seriesId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SeriesJoinRequest_seriesId_userId_key" ON "SeriesJoinRequest"("seriesId", "userId");

-- AddForeignKey
ALTER TABLE "SeriesJoinRequest" ADD CONSTRAINT "SeriesJoinRequest_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "GameSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeriesJoinRequest" ADD CONSTRAINT "SeriesJoinRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Data fix: the weekly series generator used to create every game with "isFriendsOnly" = false,
-- so the future games of friends-only groups were public. Re-align them with their group
-- (the generator itself is fixed in server/index.js in the same change).
UPDATE "Game" g
SET "isFriendsOnly" = true,
    "friendsOnlyLinkPolicy" = s."friendsOnlyLinkPolicy"
FROM "GameSeries" s
WHERE g."seriesId" = s."id"
  AND s."isFriendsOnly" = true
  AND g."isFriendsOnly" = false
  AND g."friendsOnlyUntil" IS NULL
  AND g."start" >= now();
