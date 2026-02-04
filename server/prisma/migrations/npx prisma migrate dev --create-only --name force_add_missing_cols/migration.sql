DO $$ BEGIN
    CREATE TYPE "public"."GameStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TYPE "public"."MessageStatus" ADD VALUE IF NOT EXISTS 'rejected';

ALTER TABLE "public"."Game" ADD COLUMN IF NOT EXISTS "status" "public"."GameStatus" NOT NULL DEFAULT 'OPEN';