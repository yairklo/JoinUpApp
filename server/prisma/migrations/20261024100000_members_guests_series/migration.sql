ALTER TABLE "Game"
  ADD COLUMN "membersOnlyPriority" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "guestRegistrationOpensAt" TIMESTAMP(3),
  ADD COLUMN "guestWelcomeMessage" TEXT,
  ADD COLUMN "guestDescription" TEXT,
  ADD COLUMN "guestPrice" INTEGER;

ALTER TABLE "GameSeries"
  ADD COLUMN "membersOnlyPriority" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "guestRegistrationOpenHours" DOUBLE PRECISION,
  ADD COLUMN "guestWelcomeMessage" TEXT,
  ADD COLUMN "guestDescription" TEXT,
  ADD COLUMN "guestPrice" INTEGER;
