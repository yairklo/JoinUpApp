-- Add friends-only visibility flag to Game
ALTER TABLE "Game"
ADD COLUMN IF NOT EXISTS "isFriendsOnly" boolean NOT NULL DEFAULT false;


