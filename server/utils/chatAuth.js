const { prisma } = require('../lib/prisma');

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
            where: {
                gameId: String(chatId),
                userId: String(userId),
                status: { in: ['CONFIRMED', 'WAITLISTED'] },
            }
        });

        if (gameParticipation) {
            // User is in the game! Add them to the ChatRoom
            try {
                await prisma.chatParticipant.create({
                    data: { userId: String(userId), chatId: String(chatId) }
                });
                console.log(`[Self-Healing] Created missing ChatParticipant for user ${userId} in chat ${chatId}`);
            } catch (e) {
                if (e.code !== 'P2002') throw e;
            }
            return true;
        }

        // Manager pick chat: allow organizers/managers into mgrpick_* rooms
        if (String(chatId).startsWith('mgrpick_')) {
            const gameIdFromChat = String(chatId).replace(/^mgrpick_/, '');
            const game = await prisma.game.findUnique({
                where: { id: gameIdFromChat },
                include: { roles: true },
            });
            if (game) {
                const isManager =
                    game.organizerId === String(userId) ||
                    (game.roles || []).some(
                        (r) => r.userId === String(userId) && (r.role === 'MANAGER' || r.role === 'ORGANIZER')
                    );
                if (isManager) {
                    try {
                        await prisma.chatParticipant.create({
                            data: { userId: String(userId), chatId: String(chatId) },
                        });
                    } catch (e) {
                        if (e.code !== 'P2002') throw e;
                    }
                    return true;
                }
            }
        }

        // Also allow if game.managerPickChatId matches and user is a manager
        const pickGame = await prisma.game.findFirst({
            where: { managerPickChatId: String(chatId) },
            include: { roles: true },
        });
        if (pickGame) {
            const isManager =
                pickGame.organizerId === String(userId) ||
                (pickGame.roles || []).some(
                    (r) => r.userId === String(userId) && (r.role === 'MANAGER' || r.role === 'ORGANIZER')
                );
            if (isManager) {
                try {
                    await prisma.chatParticipant.create({
                        data: { userId: String(userId), chatId: String(chatId) },
                    });
                } catch (e) {
                    if (e.code !== 'P2002') throw e;
                }
                return true;
            }
        }

        return false;
    } catch (error) {
        console.error('[chatAuth] Chat permission check error during Self-Healing:', error.message);
        return false;
    }
}

module.exports = { checkChatPermission };
