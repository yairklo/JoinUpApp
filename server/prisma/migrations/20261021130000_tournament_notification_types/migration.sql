-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'TOURNAMENT_TEAM_INVITE';
ALTER TYPE "NotificationType" ADD VALUE 'TOURNAMENT_TEAM_DECISION';
ALTER TYPE "NotificationType" ADD VALUE 'TOURNAMENT_MATCH_SCHEDULED';
ALTER TYPE "NotificationType" ADD VALUE 'TOURNAMENT_STARTING_SOON';

