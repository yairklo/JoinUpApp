-- Multi-round game results. Additive: every existing GameResult becomes round 1.
-- No result, side, score, or stat row is deleted.

CREATE TYPE "ResultLineupMode" AS ENUM ('FIXED_TEAMS', 'ROTATING_LINEUPS');

ALTER TABLE "GameResult" ADD COLUMN "lineupMode" "ResultLineupMode";

CREATE TABLE "GameResultRound" (
    "id" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "GameResultRound_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GameResultRoundPlayer" (
    "id" TEXT NOT NULL,
    "sideId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goals" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GameResultRoundPlayer_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "GameResultSide" ADD COLUMN "roundId" TEXT;

-- One round per result that does not have one yet. The id is deterministic so a re-run is a no-op.
INSERT INTO "GameResultRound" ("id", "resultId", "order")
SELECT 'r1_' || r."id", r."id", 1
FROM "GameResult" r
WHERE NOT EXISTS (
    SELECT 1 FROM "GameResultRound" q WHERE q."resultId" = r."id"
);

UPDATE "GameResultSide" s
SET "roundId" = 'r1_' || s."resultId"
WHERE s."roundId" IS NULL
  AND EXISTS (SELECT 1 FROM "GameResult" r WHERE r."id" = s."resultId");

-- Refuse to continue if any historical side would be left without its score.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "GameResultSide" WHERE "roundId" IS NULL) THEN
        RAISE EXCEPTION 'game result rounds migration: a GameResultSide could not be attached to round 1';
    END IF;
END $$;

ALTER TABLE "GameResultSide" ALTER COLUMN "roundId" SET NOT NULL;

-- (resultId, order) cannot stay: round 2 also uses orders 0 and 1.
-- The original migration created this as a unique index, not a table constraint.
DROP INDEX IF EXISTS "GameResultSide_resultId_order_key";

CREATE UNIQUE INDEX "GameResultRound_resultId_order_key" ON "GameResultRound"("resultId", "order");
CREATE INDEX "GameResultRound_resultId_idx" ON "GameResultRound"("resultId");
CREATE UNIQUE INDEX "GameResultSide_roundId_order_key" ON "GameResultSide"("roundId", "order");
CREATE INDEX "GameResultSide_resultId_idx" ON "GameResultSide"("resultId");
CREATE UNIQUE INDEX "GameResultRoundPlayer_sideId_userId_key" ON "GameResultRoundPlayer"("sideId", "userId");
CREATE INDEX "GameResultRoundPlayer_userId_idx" ON "GameResultRoundPlayer"("userId");

ALTER TABLE "GameResultRound"
    ADD CONSTRAINT "GameResultRound_resultId_fkey"
    FOREIGN KEY ("resultId") REFERENCES "GameResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GameResultSide"
    ADD CONSTRAINT "GameResultSide_roundId_fkey"
    FOREIGN KEY ("roundId") REFERENCES "GameResultRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GameResultRoundPlayer"
    ADD CONSTRAINT "GameResultRoundPlayer_sideId_fkey"
    FOREIGN KEY ("sideId") REFERENCES "GameResultSide"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GameResultRoundPlayer"
    ADD CONSTRAINT "GameResultRoundPlayer_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
