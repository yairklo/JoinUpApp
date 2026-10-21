-- CreateEnum
CREATE TYPE "GameResultStatus" AS ENUM ('DRAFT', 'FINAL');

-- CreateEnum
CREATE TYPE "ResultOutcome" AS ENUM ('WIN', 'LOSS', 'DRAW');

-- CreateEnum
CREATE TYPE "UserReportReason" AS ENUM ('HARASSMENT', 'VIOLENCE', 'CHEATING', 'NO_SHOW', 'FAKE_PROFILE', 'INAPPROPRIATE_CONTENT', 'RESULT_DISPUTE', 'OTHER');

-- CreateEnum
CREATE TYPE "UserReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "hideMatchStats" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "GameResult" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "sport" "SportType" NOT NULL,
    "status" "GameResultStatus" NOT NULL DEFAULT 'FINAL',
    "recordedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedById" TEXT,
    "editedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "GameResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameResultSide" (
    "id" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "teamId" TEXT,
    "label" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "sets" JSONB,
    "outcome" "ResultOutcome" NOT NULL,

    CONSTRAINT "GameResultSide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerStatEntry" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sideId" TEXT,
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "PlayerStatEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "gameId" TEXT,
    "reason" "UserReportReason" NOT NULL,
    "details" TEXT,
    "status" "UserReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GameResult_gameId_key" ON "GameResult"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "GameResultSide_resultId_order_key" ON "GameResultSide"("resultId", "order");

-- CreateIndex
CREATE INDEX "PlayerStatEntry_userId_key_idx" ON "PlayerStatEntry"("userId", "key");

-- CreateIndex
CREATE INDEX "PlayerStatEntry_gameId_idx" ON "PlayerStatEntry"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerStatEntry_gameId_userId_key_key" ON "PlayerStatEntry"("gameId", "userId", "key");

-- CreateIndex
CREATE INDEX "UserReport_status_createdAt_idx" ON "UserReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "UserReport_targetId_idx" ON "UserReport"("targetId");

-- AddForeignKey
ALTER TABLE "GameResult" ADD CONSTRAINT "GameResult_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameResultSide" ADD CONSTRAINT "GameResultSide_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "GameResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerStatEntry" ADD CONSTRAINT "PlayerStatEntry_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerStatEntry" ADD CONSTRAINT "PlayerStatEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserReport" ADD CONSTRAINT "UserReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserReport" ADD CONSTRAINT "UserReport_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

