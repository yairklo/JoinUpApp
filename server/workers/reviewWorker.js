const { moderator } = require('../moderationInstance');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function processReviewQueue() {
    console.log("[WORKER] Checking for pending reviews...");

    // 1. Fetch messages that failed previously
    // Equivalent to: db.flaggedMessages.find({ status: 'PENDING_RETRY', retryCount: { $lt: 3 } });
    const failedMessages = await prisma.flaggedMessage.findMany({
        where: {
            status: 'PENDING_RETRY',
            retryCount: { lt: 3 }
        }
    });

    if (failedMessages.length === 0) return;

    for (const item of failedMessages) {
        console.log(`[WORKER] Retrying message ${item.messageId}...`);

        // Check if we should wait before retrying (based on Google's retryDelay)
        if (item.aiTriggers && typeof item.aiTriggers === 'object' && item.aiTriggers.retryAfter) {
            const retryAfter = new Date(item.aiTriggers.retryAfter);
            const now = new Date();
            if (now < retryAfter) {
                const waitSeconds = Math.ceil((retryAfter - now) / 1000);
                console.log(`[WORKER] Skipping message ${item.messageId} - retry in ${waitSeconds}s (Google API requested delay)`);
                continue;
            }
        }

        // Extract age context from aiTriggers if available
        let senderAge = null;
        let receiverAge = null;
        try {
            if (item.aiTriggers && typeof item.aiTriggers === 'object') {
                senderAge = item.aiTriggers.senderAge || null;
                receiverAge = item.aiTriggers.receiverAge || null;
            }
        } catch (e) {
            console.error('[WORKER] Failed to parse aiTriggers:', e);
        }

        // Retry moderation with the original user context + age data
        const result = await moderator.checkMessage(
            item.content,
            [], // History might be hard to reconstruct here, usually empty or fetched from DB
            {},
            {
                userId: item.userId,
                userAge: senderAge,
                receiverAge: receiverAge
            }
        );

        if (!result.reviewNeeded) {
            // Success! The AI system is back online
            if (result.isSafe) {
                await prisma.flaggedMessage.update({
                    where: { id: item.id },
                    data: { status: 'RESOLVED', resolution: 'AUTO_APPROVED' }
                });
            } else {
                // Danger detected after recovery!
                console.log(`[WORKER] TOXIC CONTENT DETECTED RETROACTIVELY: ${item.messageId}`);

                // 1. Delete from Chat UI (Implementation depends on your socket setup)
                // If messageId exists, mark as deleted/rejected
                if (item.messageId) {
                    await deleteMessageFromChat(item.messageId);
                }

                // 2. Mark as rejected
                await prisma.flaggedMessage.update({
                    where: { id: item.id },
                    data: { status: 'RESOLVED', resolution: 'AUTO_REJECTED' }
                });

                // 3. Punish user
                await moderator.security.adjustReputation(item.userId, -20);
            }
        } else {
            // Still failing... increment retry count
            await prisma.flaggedMessage.update({
                where: { id: item.id },
                data: { retryCount: { increment: 1 } }
            });
        }
    }
}

// Helper stub
// Helper stub
async function deleteMessageFromChat(msgId, roomId) {
    const { Logger } = require('../utils/logger');
    // Mark as rejected in Message table
    try {
        await prisma.message.updateMany({
            where: { id: msgId },
            data: {
                status: 'rejected',
                text: '[Message removed by moderator]'
            }
        });
        Logger.info("WORKER", `marked ${msgId} as rejected in DB`);

        // FIX 4: Redis Pub/Sub if available
        if (process.env.REDIS_URL) {
            // Lazy load redis publisher
            const Redis = require("ioredis");
            // Use dedicated connection for publishing in worker (good practice to not reuse blocking connections if any)
            const publisher = new Redis(process.env.REDIS_URL);

            // We need accurate roomId to broadcast to specific room
            const msg = await prisma.message.findUnique({ where: { id: msgId } });
            const targetRoomId = roomId || (msg ? msg.chatRoomId : null);

            if (targetRoomId) {
                const finalPayload = JSON.stringify({ type: 'delete', messageId: msgId, roomId: targetRoomId });
                await publisher.publish('moderation_events', finalPayload);
                Logger.info("WORKER", `Published delete event for ${msgId} to Redis channel 'moderation_events'`);

                // Cleanup publisher connection after use to prevent leaks in worker loop
                publisher.quit();
            } else {
                Logger.warn("WORKER", `Could not find roomId for message ${msgId}, skipping Redis publish`);
                publisher.quit();
            }
        } else {
            Logger.warn("WORKER", "REDIS_URL not set. Cannot publish revocation event to socket server.");
        }

    } catch (e) {
        Logger.error("WORKER", `Failed to delete message ${msgId}:`, e);
    }
}

module.exports = { processReviewQueue };
