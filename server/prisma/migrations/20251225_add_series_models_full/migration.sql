-- Safe-create enum RecurrenceType
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RecurrenceType') THEN
    CREATE TYPE "RecurrenceType" AS ENUM ('WEEKLY', 'CUSTOM');
  END IF;
END$$;

-- Add seriesId column to Game if missing
ALTER TABLE "Game" ADD COLUMN IF NOT EXISTS "seriesId" TEXT;

-- Create GameSeries table if missing
CREATE TABLE IF NOT EXISTS "GameSeries" (
  "id"            TEXT PRIMARY KEY,
  "organizerId"   TEXT NOT NULL,
  "fieldId"       TEXT,
  "fieldName"     TEXT NOT NULL,
  "fieldLocation" TEXT NOT NULL,
  "price"         INTEGER NOT NULL DEFAULT 0,
  "maxPlayers"    INTEGER NOT NULL,
  "dayOfWeek"     INTEGER,
  "time"          TEXT NOT NULL,
  "duration"      DOUBLE PRECISION NOT NULL,
  "isActive"      BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"     TIMESTAMP NOT NULL DEFAULT NOW(),
  "type"          "RecurrenceType" NOT NULL DEFAULT 'WEEKLY'
);

-- Create SeriesParticipant table if missing
CREATE TABLE IF NOT EXISTS "SeriesParticipant" (
  "id"        TEXT PRIMARY KEY,
  "seriesId"  TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Unique constraint for (seriesId, userId)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'SeriesParticipant_seriesId_userId_key'
  ) THEN
    ALTER TABLE "SeriesParticipant"
    ADD CONSTRAINT "SeriesParticipant_seriesId_userId_key" UNIQUE ("seriesId","userId");
  END IF;
END$$;

-- Foreign keys (guarded)
DO $$
BEGIN
  -- Game.seriesId -> GameSeries.id (SET NULL on delete)
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Game_seriesId_fkey'
  ) THEN
    ALTER TABLE "Game"
    ADD CONSTRAINT "Game_seriesId_fkey"
    FOREIGN KEY ("seriesId") REFERENCES "GameSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  -- SeriesParticipant.seriesId -> GameSeries.id (CASCADE on delete)
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'SeriesParticipant_seriesId_fkey'
  ) THEN
    ALTER TABLE "SeriesParticipant"
    ADD CONSTRAINT "SeriesParticipant_seriesId_fkey"
    FOREIGN KEY ("seriesId") REFERENCES "GameSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- SeriesParticipant.userId -> User.id (CASCADE on delete)
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'SeriesParticipant_userId_fkey'
  ) THEN
    ALTER TABLE "SeriesParticipant"
    ADD CONSTRAINT "SeriesParticipant_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;


