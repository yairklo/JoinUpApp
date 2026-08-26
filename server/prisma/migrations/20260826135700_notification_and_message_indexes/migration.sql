CREATE INDEX "Message_chatRoomId_status_userId_idx" ON "Message"("chatRoomId", "status", "userId");
CREATE INDEX "Notification_userId_type_createdAt_idx" ON "Notification"("userId", "type", "createdAt" DESC);
