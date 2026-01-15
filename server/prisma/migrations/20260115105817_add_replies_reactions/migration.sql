-- AlterTable
ALTER TABLE "public"."Message" ADD COLUMN     "replyToId" TEXT;

-- CreateTable
CREATE TABLE "public"."Reaction" (
    "id" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Reaction_userId_messageId_emoji_key" ON "public"."Reaction"("userId", "messageId", "emoji");

-- AddForeignKey
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "public"."Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Reaction" ADD CONSTRAINT "Reaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
