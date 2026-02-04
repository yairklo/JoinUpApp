
ALTER TABLE "public"."User" ADD COLUMN IF NOT EXISTS "reputation" INTEGER NOT NULL DEFAULT 50;

CREATE TABLE "public"."FlaggedMessage" (
    "id" TEXT NOT NULL,
    "messageId" TEXT,
    "content" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_RETRY',
    "resolution" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "failureReason" TEXT,
    "aiTriggers" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlaggedMessage_pkey" PRIMARY KEY ("id")
);