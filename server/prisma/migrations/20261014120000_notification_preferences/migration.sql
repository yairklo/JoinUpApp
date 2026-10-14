-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'FRIEND_NEW_GAME';
ALTER TYPE "NotificationType" ADD VALUE 'FRIEND_JOINED_GAME';
ALTER TYPE "NotificationType" ADD VALUE 'NEW_SERIES_GAME';

-- CreateEnum
CREATE TYPE "NotificationMuteTarget" AS ENUM ('USER', 'SERIES', 'GAME');

-- AlterTable
ALTER TABLE "UserNotificationSettings" ADD COLUMN     "friendRequestsInApp" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "gameRemindersInApp" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "myGamesPush" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "myGamesInApp" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "invitationsPush" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "invitationsInApp" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "organizerPush" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "organizerInApp" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "groupGamesPush" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "groupGamesInApp" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "friendGamesPush" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "friendGamesInApp" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "friendJoinsPush" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "friendJoinsInApp" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cityGamesPush" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cityGamesInApp" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "cityGamesDigest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cityGamesSports" "SportType"[] DEFAULT ARRAY[]::"SportType"[],
ADD COLUMN     "cityGamesCities" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "quietHoursStart" INTEGER NOT NULL DEFAULT 1380,
ADD COLUMN     "quietHoursEnd" INTEGER NOT NULL DEFAULT 420,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Asia/Jerusalem',
ADD COLUMN     "snoozeUntil" TIMESTAMP(3),
ADD COLUMN     "digestHour" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN     "lastDigestAt" TIMESTAMP(3),
ADD COLUMN     "cityPromptDismissedAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "NotificationMute" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetType" "NotificationMuteTarget" NOT NULL,
    "targetId" TEXT NOT NULL,
    "until" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationMute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationMute_targetType_targetId_idx" ON "NotificationMute"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationMute_userId_targetType_targetId_key" ON "NotificationMute"("userId", "targetType", "targetId");

-- AddForeignKey
ALTER TABLE "NotificationMute" ADD CONSTRAINT "NotificationMute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
