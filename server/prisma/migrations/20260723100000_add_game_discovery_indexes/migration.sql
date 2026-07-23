-- Discovery feed indexes: city games, my games, friends games, active series
CREATE INDEX IF NOT EXISTS "Field_city_idx" ON "Field"("city");

CREATE INDEX IF NOT EXISTS "Participation_userId_idx" ON "Participation"("userId");
CREATE INDEX IF NOT EXISTS "Participation_gameId_status_idx" ON "Participation"("gameId", "status");

CREATE INDEX IF NOT EXISTS "Game_status_start_idx" ON "Game"("status", "start");

CREATE INDEX IF NOT EXISTS "Friendship_userAId_idx" ON "Friendship"("userAId");
CREATE INDEX IF NOT EXISTS "Friendship_userBId_idx" ON "Friendship"("userBId");

CREATE INDEX IF NOT EXISTS "GameSeries_isActive_idx" ON "GameSeries"("isActive");
