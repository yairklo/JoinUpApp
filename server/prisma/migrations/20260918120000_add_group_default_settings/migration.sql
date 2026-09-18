-- Add group-level (GameSeries) default settings that previously only existed per-game.
-- Uses IF NOT EXISTS per column because two of these (isFriendsOnly, joinPolicy) were already
-- applied out-of-band to the shared dev database by unrelated work; this keeps the migration
-- safe/idempotent to apply on any environment regardless of that drift.
ALTER TABLE "GameSeries"
  ADD COLUMN IF NOT EXISTS "isOpenToJoin" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "isFriendsOnly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "joinPolicy" "JoinPolicy" NOT NULL DEFAULT 'INSTANT',
  ADD COLUMN IF NOT EXISTS "lotteryEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "organizerInLottery" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "teamSize" INTEGER,
  ADD COLUMN IF NOT EXISTS "welcomeMessage" TEXT;
