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
    try {
        const participant = await prisma.chatParticipant.findUnique({
            where: {
                userId_chatId: {
                    userId: String(userId),
                    chatId: String(chatId)
                }
            }
        });
        return !!participant;
    } catch (error) {
        console.error('Chat permission check error:', error);
        return false;
    }
}

module.exports = { checkChatPermission };
