-- Manual standings override for one group or league table, plus optional additive points adjustments.
-- Additive only: no existing column or row is rewritten.

CREATE TABLE "TournamentStandingsOverride" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "groupId" TEXT,
    "tableKey" TEXT NOT NULL,
    "teamOrder" TEXT[] NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentStandingsOverride_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TournamentStandingsAdjustment" (
    "id" TEXT NOT NULL,
    "overrideId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,

    CONSTRAINT "TournamentStandingsAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TournamentStandingsOverride_tableKey_key" ON "TournamentStandingsOverride"("tableKey");
CREATE INDEX "TournamentStandingsOverride_tournamentId_idx" ON "TournamentStandingsOverride"("tournamentId");
CREATE UNIQUE INDEX "TournamentStandingsAdjustment_overrideId_teamId_key" ON "TournamentStandingsAdjustment"("overrideId", "teamId");
CREATE INDEX "TournamentStandingsAdjustment_teamId_idx" ON "TournamentStandingsAdjustment"("teamId");

ALTER TABLE "TournamentStandingsOverride" ADD CONSTRAINT "TournamentStandingsOverride_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TournamentStandingsOverride" ADD CONSTRAINT "TournamentStandingsOverride_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "TournamentStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TournamentStandingsOverride" ADD CONSTRAINT "TournamentStandingsOverride_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TournamentGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TournamentStandingsOverride" ADD CONSTRAINT "TournamentStandingsOverride_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TournamentStandingsOverride" ADD CONSTRAINT "TournamentStandingsOverride_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TournamentStandingsAdjustment" ADD CONSTRAINT "TournamentStandingsAdjustment_overrideId_fkey" FOREIGN KEY ("overrideId") REFERENCES "TournamentStandingsOverride"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TournamentStandingsAdjustment" ADD CONSTRAINT "TournamentStandingsAdjustment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "TournamentTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
