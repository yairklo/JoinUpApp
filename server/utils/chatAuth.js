const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Checks if a user is a participant of a specific chat room.
 * @param {string} userId - The ID of the user.
 * @param {string} chatId - The ID of the chat room.
 * @returns {Promise<boolean>} - True if authorized, false otherwise.
 */
async function checkChatPermission(userId, chatId) {
    if (!userId || !chatId) return false;
    let participant = null;
    try {
        participant = await prisma.chatParticipant.findFirst({
            where: { userId: String(userId), chatId: String(chatId) }
        });
    } catch (e) {
        console.warn(`[chatAuth] Failed to fetch ChatParticipant for ${userId} in ${chatId}, falling back to Self-Healing. Error: ${e.message}`);
    }

    if (participant) return true;

    try {
        // Self-Healing: Check if this is a game chat, and if the user is in the game's Participation
        const gameParticipation = await prisma.participation.findFirst({
            where: { gameId: String(chatId), userId: String(userId) }
        });

        if (gameParticipation) {
            // User is in the game! Add them to the ChatRoom
            await prisma.chatParticipant.create({
                data: { userId: String(userId), chatId: String(chatId) }
            });
            console.log(`[Self-Healing] Created missing ChatParticipant for user ${userId} in chat ${chatId}`);
            return true;
        }
        return false;
    } catch (error) {
        console.error('[chatAuth] Chat permission check error during Self-Healing:', error.message);
        return false;
    }
}

module.exports = { checkChatPermission };
