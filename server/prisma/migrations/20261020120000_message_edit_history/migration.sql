-- Keep the original text when a message is edited or deleted so reports and the admin
-- moderation queue cannot be evaded by editing/deleting before someone reports.
ALTER TABLE "Message" ADD COLUMN "deletedText" TEXT;
ALTER TABLE "Message" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE TABLE "MessageEdit" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "previousText" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageEdit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MessageEdit_messageId_editedAt_idx" ON "MessageEdit"("messageId", "editedAt");

ALTER TABLE "MessageEdit" ADD CONSTRAINT "MessageEdit_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
