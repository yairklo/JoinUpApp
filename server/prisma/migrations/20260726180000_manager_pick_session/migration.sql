-- CreateEnum
CREATE TYPE "PickSessionStatus" AS ENUM ('IDLE', 'DRAW_SCHEDULED', 'ORDER_SET', 'PICKING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterTable Game: manager pick-session scheduling + turn order
ALTER TABLE "Game" ADD COLUMN IF NOT EXISTS "pickDrawAt" TIMESTAMP(3);
ALTER TABLE "Game" ADD COLUMN IF NOT EXISTS "pickDrawExecutedAt" TIMESTAMP(3);
ALTER TABLE "Game" ADD COLUMN IF NOT EXISTS "pickingStartsAt" TIMESTAMP(3);
ALTER TABLE "Game" ADD COLUMN IF NOT EXISTS "pickingOpenedAt" TIMESTAMP(3);
ALTER TABLE "Game" ADD COLUMN IF NOT EXISTS "pickSessionStatus" "PickSessionStatus" NOT NULL DEFAULT 'IDLE';
ALTER TABLE "Game" ADD COLUMN IF NOT EXISTS "pickTurnOrder" JSONB;
ALTER TABLE "Game" ADD COLUMN IF NOT EXISTS "pickCurrentTurnIndex" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Game" ADD COLUMN IF NOT EXISTS "managerPickChatId" TEXT;

-- AlterTable Team: optional manager ownership for draft picks
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "managerId" TEXT;

-- CreateTable PlayerTrade
CREATE TABLE IF NOT EXISTS "PlayerTrade" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "proposerId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "offeredPlayerIds" TEXT[],
    "requestedPlayerIds" TEXT[],
    "status" "TradeStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "PlayerTrade_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "Game_pickDrawAt_pickDrawExecutedAt_idx" ON "Game"("pickDrawAt", "pickDrawExecutedAt");
CREATE INDEX IF NOT EXISTS "Game_pickingStartsAt_pickingOpenedAt_idx" ON "Game"("pickingStartsAt", "pickingOpenedAt");
CREATE INDEX IF NOT EXISTS "Team_gameId_managerId_idx" ON "Team"("gameId", "managerId");
CREATE INDEX IF NOT EXISTS "PlayerTrade_gameId_status_idx" ON "PlayerTrade"("gameId", "status");
CREATE INDEX IF NOT EXISTS "PlayerTrade_receiverId_status_idx" ON "PlayerTrade"("receiverId", "status");
CREATE INDEX IF NOT EXISTS "PlayerTrade_proposerId_idx" ON "PlayerTrade"("proposerId");

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "PlayerTrade" ADD CONSTRAINT "PlayerTrade_gameId_fkey"
    FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
