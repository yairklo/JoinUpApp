-- CreateEnum
CREATE TYPE "public"."GameStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."MessageStatus" AS ENUM ('sent', 'delivered', 'read', 'rejected');

-- CreateEnum
CREATE TYPE "public"."FieldType" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "public"."FriendRequestStatus" AS ENUM ('PENDING', 'DECLINED');

-- CreateEnum
CREATE TYPE "public"."ParticipationStatus" AS ENUM ('WAITLISTED', 'CONFIRMED', 'CANCELLED', 'NOT_SELECTED');

-- CreateEnum
CREATE TYPE "public"."GameRoleType" AS ENUM ('ORGANIZER', 'MANAGER', 'MODERATOR');

-- CreateEnum
CREATE TYPE "public"."RecurrenceType" AS ENUM ('WEEKLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "public"."SportType" AS ENUM ('SOCCER', 'BASKETBALL', 'TENNIS');

-- CreateEnum
CREATE TYPE "public"."NotificationType" AS ENUM ('FRIEND_REQUEST', 'FRIEND_ACCEPTED', 'NEW_MESSAGE', 'GAME_REMINDER', 'GAME_CANCELLED', 'GAME_UPDATED');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "birthDate" TIMESTAMP(3),
    "city" TEXT,
    "phone" TEXT,
    "reputation" INTEGER NOT NULL DEFAULT 50,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Field" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL DEFAULT 0,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "image" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "type" "public"."FieldType" NOT NULL,
    "supportedSports" "public"."SportType"[] DEFAULT ARRAY['SOCCER']::"public"."SportType"[],
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "city" TEXT,
    "email" TEXT,
    "featuresJson" JSONB,
    "neighborhood" TEXT,
    "phone" TEXT,
    "photos" TEXT[],
    "street" TEXT,
    "streetNumber" TEXT,

    CONSTRAINT "Field_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Game" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "fieldId" TEXT NOT NULL,
    "seriesId" TEXT,
    "start" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 1,
    "maxPlayers" INTEGER NOT NULL,
    "teamSize" INTEGER,
    "price" INTEGER,
    "isOpenToJoin" BOOLEAN NOT NULL DEFAULT true,
    "isFriendsOnly" BOOLEAN NOT NULL DEFAULT false,
    "friendsOnlyUntil" TIMESTAMP(3),
    "lotteryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lotteryAt" TIMESTAMP(3),
    "organizerInLottery" BOOLEAN NOT NULL DEFAULT false,
    "lotteryExecutedAt" TIMESTAMP(3),
    "description" TEXT,
    "customLat" DOUBLE PRECISION,
    "customLng" DOUBLE PRECISION,
    "customLocation" TEXT,
    "organizerId" TEXT NOT NULL,
    "sport" "public"."SportType" NOT NULL DEFAULT 'SOCCER',
    "status" "public"."GameStatus" NOT NULL DEFAULT 'OPEN',
    "registrationOpensAt" TIMESTAMP(3),
    "reminderSent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Participation" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT,
    "status" "public"."ParticipationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Participation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ChatRoom" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'PRIVATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ChatParticipant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadAt" TIMESTAMP(3),

    CONSTRAINT "ChatParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Message" (
    "id" TEXT NOT NULL,
    "chatRoomId" TEXT NOT NULL,
    "userId" TEXT,
    "text" TEXT NOT NULL,
    "status" "public"."MessageStatus" NOT NULL DEFAULT 'sent',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isEdited" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "replyToId" TEXT,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Reaction" (
    "id" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FavoriteField" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,

    CONSTRAINT "FavoriteField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Friendship" (
    "id" TEXT NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FriendRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "status" "public"."FriendRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FriendRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Sport" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Sport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Position" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sportId" TEXT NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserSport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sportId" TEXT NOT NULL,
    "positionDescription" TEXT,

    CONSTRAINT "UserSport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserPosition" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,

    CONSTRAINT "UserPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GameRole" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "public"."GameRoleType" NOT NULL DEFAULT 'MANAGER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Team" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GameSeries" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "organizerId" TEXT NOT NULL,
    "fieldId" TEXT,
    "fieldName" TEXT NOT NULL,
    "fieldLocation" TEXT NOT NULL,
    "price" INTEGER NOT NULL DEFAULT 0,
    "maxPlayers" INTEGER NOT NULL,
    "dayOfWeek" INTEGER,
    "time" TEXT NOT NULL,
    "duration" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sport" "public"."SportType" NOT NULL DEFAULT 'SOCCER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "public"."RecurrenceType" NOT NULL DEFAULT 'WEEKLY',
    "autoOpenRegistrationHours" DOUBLE PRECISION,

    CONSTRAINT "GameSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SeriesParticipant" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeriesParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FlaggedMessage" (
    "id" TEXT NOT NULL,
    "messageId" TEXT,
    "content" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_RETRY',
    "resolution" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "failureReason" TEXT,
    "aiTriggers" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlaggedMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "public"."NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fcmToken" TEXT NOT NULL,
    "deviceType" TEXT,
    "deviceName" TEXT,
    "lastUsed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserNotificationSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
    "friendRequestsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "messagesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "gameRemindersEnabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "UserNotificationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Participation_gameId_userId_key" ON "public"."Participation"("gameId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatParticipant_userId_chatId_key" ON "public"."ChatParticipant"("userId", "chatId");

-- CreateIndex
CREATE UNIQUE INDEX "Reaction_userId_messageId_emoji_key" ON "public"."Reaction"("userId", "messageId", "emoji");

-- CreateIndex
CREATE UNIQUE INDEX "FavoriteField_userId_fieldId_key" ON "public"."FavoriteField"("userId", "fieldId");

-- CreateIndex
CREATE UNIQUE INDEX "Friendship_userAId_userBId_key" ON "public"."Friendship"("userAId", "userBId");

-- CreateIndex
CREATE UNIQUE INDEX "FriendRequest_requesterId_receiverId_key" ON "public"."FriendRequest"("requesterId", "receiverId");

-- CreateIndex
CREATE UNIQUE INDEX "Sport_name_key" ON "public"."Sport"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Position_sportId_name_key" ON "public"."Position"("sportId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "UserSport_userId_sportId_key" ON "public"."UserSport"("userId", "sportId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPosition_userId_positionId_key" ON "public"."UserPosition"("userId", "positionId");

-- CreateIndex
CREATE UNIQUE INDEX "GameRole_gameId_userId_key" ON "public"."GameRole"("gameId", "userId");

-- CreateIndex
CREATE INDEX "Team_gameId_idx" ON "public"."Team"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "SeriesParticipant_seriesId_userId_key" ON "public"."SeriesParticipant"("seriesId", "userId");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "public"."Notification"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "public"."Notification"("userId", "read");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "public"."Notification"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserDevice_fcmToken_key" ON "public"."UserDevice"("fcmToken");

-- CreateIndex
CREATE INDEX "UserDevice_userId_idx" ON "public"."UserDevice"("userId");

-- CreateIndex
CREATE INDEX "UserDevice_fcmToken_idx" ON "public"."UserDevice"("fcmToken");

-- CreateIndex
CREATE UNIQUE INDEX "UserNotificationSettings_userId_key" ON "public"."UserNotificationSettings"("userId");

-- AddForeignKey
ALTER TABLE "public"."Game" ADD CONSTRAINT "Game_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "public"."Field"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Game" ADD CONSTRAINT "Game_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Game" ADD CONSTRAINT "Game_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "public"."GameSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Participation" ADD CONSTRAINT "Participation_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "public"."Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Participation" ADD CONSTRAINT "Participation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Participation" ADD CONSTRAINT "Participation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatParticipant" ADD CONSTRAINT "ChatParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatParticipant" ADD CONSTRAINT "ChatParticipant_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "public"."ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_chatRoomId_fkey" FOREIGN KEY ("chatRoomId") REFERENCES "public"."ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "public"."Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Reaction" ADD CONSTRAINT "Reaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FavoriteField" ADD CONSTRAINT "FavoriteField_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "public"."Field"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FavoriteField" ADD CONSTRAINT "FavoriteField_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Friendship" ADD CONSTRAINT "Friendship_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Friendship" ADD CONSTRAINT "Friendship_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FriendRequest" ADD CONSTRAINT "FriendRequest_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FriendRequest" ADD CONSTRAINT "FriendRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Position" ADD CONSTRAINT "Position_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "public"."Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserSport" ADD CONSTRAINT "UserSport_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "public"."Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserSport" ADD CONSTRAINT "UserSport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserPosition" ADD CONSTRAINT "UserPosition_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "public"."Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserPosition" ADD CONSTRAINT "UserPosition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GameRole" ADD CONSTRAINT "GameRole_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "public"."Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GameRole" ADD CONSTRAINT "GameRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Team" ADD CONSTRAINT "Team_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "public"."Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SeriesParticipant" ADD CONSTRAINT "SeriesParticipant_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "public"."GameSeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SeriesParticipant" ADD CONSTRAINT "SeriesParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserDevice" ADD CONSTRAINT "UserDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserNotificationSettings" ADD CONSTRAINT "UserNotificationSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
