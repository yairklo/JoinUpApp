-- Per-user game reminder lead time + per-user reminder dedupe. Additive only.
ALTER TABLE "UserNotificationSettings" ADD COLUMN "gameReminderLeadMinutes" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "UserNotificationSettings" ADD COLUMN "gameReminderLeadUpdatedAt" TIMESTAMP(3);

CREATE TABLE "GameReminderSent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "gameStart" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameReminderSent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GameReminderSent_userId_gameId_gameStart_key" ON "GameReminderSent"("userId", "gameId", "gameStart");
CREATE INDEX "GameReminderSent_gameId_idx" ON "GameReminderSent"("gameId");

-- Games whose single 1h reminder already went out under the old Game.reminderSent flag must not be
-- reminded a second time by the new per-user sweep: seed their dedupe rows for the current start.
INSERT INTO "GameReminderSent" ("id", "userId", "gameId", "gameStart")
SELECT gen_random_uuid()::text, p."userId", g."id", g."start"
FROM "Game" g
JOIN "Participation" p ON p."gameId" = g."id" AND p."status" = 'CONFIRMED'
WHERE g."reminderSent" = true AND g."status" = 'OPEN' AND g."start" > NOW()
ON CONFLICT DO NOTHING;

-- Games whose single 1h reminder already went out under the old Game.reminderSent flag must not be
-- reminded a second time by the new per-user sweep: seed their dedupe rows for the current start.
INSERT INTO "GameReminderSent" ("id", "userId", "gameId", "gameStart")
SELECT gen_random_uuid()::text, p."userId", g."id", g."start"
FROM "Game" g
JOIN "Participation" p ON p."gameId" = g."id" AND p."status" = 'CONFIRMED'
WHERE g."reminderSent" = true AND g."status" = 'OPEN' AND g."start" > NOW()
ON CONFLICT DO NOTHING;
