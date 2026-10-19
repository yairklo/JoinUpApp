-- Resolve any existing duplicate occurrences of the same series slot before adding the unique
-- index (two concurrent weekly-generation runs could have created them). Per (seriesId, start)
-- keep one game — a non-cancelled one first, then the oldest — and detach the rest from the
-- series instead of deleting them, so no participations, chats or history are lost. Detached
-- duplicates that have not started yet are also cancelled so they don't show up as a second game.
WITH ranked AS (
  SELECT "id", "start",
         ROW_NUMBER() OVER (
           PARTITION BY "seriesId", "start"
           ORDER BY ("status" = 'CANCELLED') ASC, "createdAt" ASC, "id" ASC
         ) AS rn
  FROM "Game"
  WHERE "seriesId" IS NOT NULL
)
UPDATE "Game" g
SET "seriesId" = NULL,
    "status" = CASE WHEN r."start" > NOW() THEN 'CANCELLED'::"GameStatus" ELSE g."status" END
FROM ranked r
WHERE g."id" = r."id" AND r.rn > 1;

-- CreateIndex
CREATE UNIQUE INDEX "Game_seriesId_start_key" ON "Game"("seriesId", "start");
