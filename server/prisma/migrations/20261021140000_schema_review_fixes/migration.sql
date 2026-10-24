-- (1) TournamentTeamMember: allow invites to several teams and re-joining after decline/removal.
-- Only one ACCEPTED membership per (tournament, user) (partial index; Prisma cannot express it).
DROP INDEX "TournamentTeamMember_tournamentId_userId_key";

CREATE INDEX "TournamentTeamMember_tournamentId_userId_idx" ON "TournamentTeamMember"("tournamentId", "userId");

CREATE UNIQUE INDEX "TournamentTeamMember_tournamentId_userId_accepted_key"
  ON "TournamentTeamMember"("tournamentId", "userId")
  WHERE "status" = 'ACCEPTED';

-- (2) PlayerStatEntry.sideId becomes a real FK to GameResultSide.
-- Clear any dangling values first so the constraint can be added.
UPDATE "PlayerStatEntry" SET "sideId" = NULL
  WHERE "sideId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "GameResultSide" s WHERE s."id" = "PlayerStatEntry"."sideId");

CREATE INDEX "PlayerStatEntry_sideId_idx" ON "PlayerStatEntry"("sideId");

ALTER TABLE "PlayerStatEntry" ADD CONSTRAINT "PlayerStatEntry_sideId_fkey"
  FOREIGN KEY ("sideId") REFERENCES "GameResultSide"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- (3) UserReport.tournamentId (optional context).
ALTER TABLE "UserReport" ADD COLUMN "tournamentId" TEXT;

CREATE INDEX "UserReport_tournamentId_idx" ON "UserReport"("tournamentId");

ALTER TABLE "UserReport" ADD CONSTRAINT "UserReport_tournamentId_fkey"
  FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- (4) TournamentTeam.manualRank.
ALTER TABLE "TournamentTeam" ADD COLUMN "manualRank" INTEGER;
