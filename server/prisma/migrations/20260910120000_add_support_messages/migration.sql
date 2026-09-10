-- CreateEnum
CREATE TYPE "SupportMessageType" AS ENUM ('BUG', 'FEEDBACK');

-- CreateEnum
CREATE TYPE "SupportMessageStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "SupportMessageType" NOT NULL,
    "message" TEXT NOT NULL,
    "context" TEXT,
    "status" "SupportMessageStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportMessage_status_createdAt_idx" ON "SupportMessage"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SupportMessage_userId_createdAt_idx" ON "SupportMessage"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
