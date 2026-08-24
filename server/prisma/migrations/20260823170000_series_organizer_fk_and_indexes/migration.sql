-- Indexes for common lookups. Composite message index supports unread scans
-- ordered by createdAt. Participation.teamId is used when listing a team's roster.
CREATE INDEX IF NOT EXISTS "Participation_teamId_idx" ON "Participation"("teamId");
CREATE INDEX IF NOT EXISTS "Message_chatRoomId_createdAt_idx" ON "Message"("chatRoomId", "createdAt");
CREATE INDEX IF NOT EXISTS "GameSeries_organizerId_idx" ON "GameSeries"("organizerId");

-- Back up any series/membership rows about to be dropped so orphaned data
-- can be recovered/reassigned by hand instead of being lost irrecoverably.
CREATE TABLE IF NOT EXISTS "_orphaned_GameSeries_backup" AS
SELECT * FROM "GameSeries" WHERE "organizerId" NOT IN (SELECT "id" FROM "User") WITH NO DATA;
INSERT INTO "_orphaned_GameSeries_backup"
SELECT * FROM "GameSeries" WHERE "organizerId" NOT IN (SELECT "id" FROM "User");

CREATE TABLE IF NOT EXISTS "_orphaned_SeriesParticipant_backup" AS
SELECT * FROM "SeriesParticipant" WHERE "seriesId" IN (
  SELECT "id" FROM "GameSeries" WHERE "organizerId" NOT IN (SELECT "id" FROM "User")
) WITH NO DATA;
INSERT INTO "_orphaned_SeriesParticipant_backup"
SELECT * FROM "SeriesParticipant" WHERE "seriesId" IN (
  SELECT "id" FROM "GameSeries" WHERE "organizerId" NOT IN (SELECT "id" FROM "User")
);

-- Drop series rows whose organizerId does not match a User (required before the FK).
DELETE FROM "SeriesParticipant"
WHERE "seriesId" IN (
  SELECT "id" FROM "GameSeries"
  WHERE "organizerId" NOT IN (SELECT "id" FROM "User")
);

UPDATE "Game"
SET "seriesId" = NULL
WHERE "seriesId" IN (
  SELECT "id" FROM "GameSeries"
  WHERE "organizerId" NOT IN (SELECT "id" FROM "User")
);

DELETE FROM "GameSeries"
WHERE "organizerId" NOT IN (SELECT "id" FROM "User");

ALTER TABLE "GameSeries"
  ADD CONSTRAINT "GameSeries_organizerId_fkey"
  FOREIGN KEY ("organizerId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
