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
        
        if (participant) return true;

        // Self-Healing: Check if this is a game chat, and if the user is in the game's Participation
        const gameParticipation = await prisma.participation.findUnique({
            where: {
                gameId_userId: {
                    gameId: String(chatId),
                    userId: String(userId)
                }
            }
        });

        if (gameParticipation) {
            // User is in the game! Add them to the ChatRoom
            await prisma.chatParticipant.create({
                data: {
                    userId: String(userId),
                    chatId: String(chatId)
                }
            });
            console.log(`[Self-Healing] Created missing ChatParticipant for user ${userId} in chat ${chatId}`);
            return true;
        }

        return false;
    } catch (error) {
        console.error('Chat permission check error:', error);
        return false;
    }
}

module.exports = { checkChatPermission };
