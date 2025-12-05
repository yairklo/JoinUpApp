-- Add optional auto-unlock timestamp for friends-only games
ALTER TABLE "Game"
ADD COLUMN IF NOT EXISTS "friendsOnlyUntil" timestamp(3);


