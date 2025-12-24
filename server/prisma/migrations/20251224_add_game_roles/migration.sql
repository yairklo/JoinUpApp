-- Create enum for game roles
DO $$ BEGIN
  CREATE TYPE "GameRoleType" AS ENUM ('ORGANIZER','MANAGER','MODERATOR');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create table GameRole
CREATE TABLE IF NOT EXISTS "GameRole" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "gameId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "GameRoleType" NOT NULL DEFAULT 'MANAGER',
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "GameRole_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GameRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Unique a single role record per (game,user)
DO $$ BEGIN
  ALTER TABLE "GameRole" ADD CONSTRAINT "GameRole_gameId_userId_key" UNIQUE ("gameId","userId");
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add Team table
CREATE TABLE IF NOT EXISTS "Team" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "gameId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "Team_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Team_gameId_idx" ON "Team" ("gameId");

-- Add teamId column to Participation
DO $$ BEGIN
  ALTER TABLE "Participation" ADD COLUMN "teamId" TEXT;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- FK from Participation.teamId -> Team.id
DO $$ BEGIN
  ALTER TABLE "Participation" ADD CONSTRAINT "Participation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;


