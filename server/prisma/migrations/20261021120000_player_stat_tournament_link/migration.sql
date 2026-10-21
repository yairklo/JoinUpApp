-- AlterTable
ALTER TABLE "PlayerStatEntry" ADD COLUMN     "tournamentMatchId" TEXT,
ALTER COLUMN "gameId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "PlayerStatEntry_tournamentMatchId_idx" ON "PlayerStatEntry"("tournamentMatchId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerStatEntry_tournamentMatchId_userId_key_key" ON "PlayerStatEntry"("tournamentMatchId", "userId", "key");

-- AddForeignKey
ALTER TABLE "PlayerStatEntry" ADD CONSTRAINT "PlayerStatEntry_tournamentMatchId_fkey" FOREIGN KEY ("tournamentMatchId") REFERENCES "TournamentMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Exactly one of gameId / tournamentMatchId must be set (Prisma cannot express CHECK constraints).
ALTER TABLE "PlayerStatEntry" ADD CONSTRAINT "PlayerStatEntry_exactly_one_source_chk"
  CHECK (("gameId" IS NULL) <> ("tournamentMatchId" IS NULL));
