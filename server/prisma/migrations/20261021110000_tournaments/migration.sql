-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TournamentFormat" AS ENUM ('LEAGUE', 'KNOCKOUT', 'GROUPS_KNOCKOUT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "TournamentTeamStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WAITLISTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "TournamentMemberRole" AS ENUM ('CAPTAIN', 'PLAYER', 'SUBSTITUTE');

-- CreateEnum
CREATE TYPE "TournamentMemberStatus" AS ENUM ('INVITED', 'ACCEPTED', 'DECLINED', 'REMOVED');

-- CreateEnum
CREATE TYPE "TournamentMatchStatus" AS ENUM ('SCHEDULED', 'LIVE', 'FINISHED', 'FORFEIT', 'POSTPONED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TournamentStageType" AS ENUM ('GROUP', 'LEAGUE', 'KNOCKOUT');

-- CreateEnum
CREATE TYPE "TournamentRoleType" AS ENUM ('ORGANIZER', 'MANAGER', 'SCOREKEEPER');

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sport" "SportType" NOT NULL,
    "imageUrl" TEXT,
    "fieldId" TEXT,
    "customLocation" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "status" "TournamentStatus" NOT NULL DEFAULT 'DRAFT',
    "format" "TournamentFormat" NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "openToMinors" BOOLEAN NOT NULL DEFAULT false,
    "registrationOpensAt" TIMESTAMP(3),
    "registrationClosesAt" TIMESTAMP(3),
    "rosterLockAt" TIMESTAMP(3),
    "minTeams" INTEGER NOT NULL DEFAULT 2,
    "maxTeams" INTEGER NOT NULL,
    "startersPerTeam" INTEGER NOT NULL,
    "minPlayersPerTeam" INTEGER NOT NULL,
    "maxPlayersPerTeam" INTEGER NOT NULL,
    "requireApproval" BOOLEAN NOT NULL DEFAULT true,
    "rules" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentTeam" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "logoUrl" TEXT,
    "captainId" TEXT NOT NULL,
    "status" "TournamentTeamStatus" NOT NULL DEFAULT 'PENDING',
    "seed" INTEGER,
    "groupId" TEXT,
    "joinCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentTeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "TournamentMemberRole" NOT NULL DEFAULT 'PLAYER',
    "status" "TournamentMemberStatus" NOT NULL DEFAULT 'INVITED',
    "jerseyNumber" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentStage" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "type" "TournamentStageType" NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,

    CONSTRAINT "TournamentStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentGroup" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "TournamentGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentMatch" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "groupId" TEXT,
    "round" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "homeTeamId" TEXT,
    "awayTeamId" TEXT,
    "homeSource" JSONB,
    "awaySource" JSONB,
    "scheduledAt" TIMESTAMP(3),
    "fieldId" TEXT,
    "courtLabel" TEXT,
    "status" "TournamentMatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "homePenalties" INTEGER,
    "awayPenalties" INTEGER,
    "details" JSONB,
    "winnerTeamId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedById" TEXT,

    CONSTRAINT "TournamentMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentRole" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "TournamentRoleType" NOT NULL,

    CONSTRAINT "TournamentRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tournament_status_startsAt_idx" ON "Tournament"("status", "startsAt");

-- CreateIndex
CREATE INDEX "Tournament_organizerId_idx" ON "Tournament"("organizerId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentTeam_joinCode_key" ON "TournamentTeam"("joinCode");

-- CreateIndex
CREATE INDEX "TournamentTeam_tournamentId_status_idx" ON "TournamentTeam"("tournamentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentTeam_tournamentId_name_key" ON "TournamentTeam"("tournamentId", "name");

-- CreateIndex
CREATE INDEX "TournamentTeamMember_teamId_idx" ON "TournamentTeamMember"("teamId");

-- CreateIndex
CREATE INDEX "TournamentTeamMember_userId_idx" ON "TournamentTeamMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentTeamMember_tournamentId_userId_key" ON "TournamentTeamMember"("tournamentId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentStage_tournamentId_order_key" ON "TournamentStage"("tournamentId", "order");

-- CreateIndex
CREATE INDEX "TournamentGroup_stageId_idx" ON "TournamentGroup"("stageId");

-- CreateIndex
CREATE INDEX "TournamentMatch_tournamentId_stageId_round_idx" ON "TournamentMatch"("tournamentId", "stageId", "round");

-- CreateIndex
CREATE INDEX "TournamentMatch_tournamentId_scheduledAt_idx" ON "TournamentMatch"("tournamentId", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentRole_tournamentId_userId_key" ON "TournamentRole"("tournamentId", "userId");

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentTeam" ADD CONSTRAINT "TournamentTeam_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentTeam" ADD CONSTRAINT "TournamentTeam_captainId_fkey" FOREIGN KEY ("captainId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentTeam" ADD CONSTRAINT "TournamentTeam_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TournamentGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentTeamMember" ADD CONSTRAINT "TournamentTeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "TournamentTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentTeamMember" ADD CONSTRAINT "TournamentTeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentStage" ADD CONSTRAINT "TournamentStage_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentGroup" ADD CONSTRAINT "TournamentGroup_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "TournamentStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "TournamentStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TournamentGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "TournamentTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "TournamentTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentRole" ADD CONSTRAINT "TournamentRole_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentRole" ADD CONSTRAINT "TournamentRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

