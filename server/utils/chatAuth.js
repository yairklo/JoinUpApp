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

function isGameManager(game, userId) {
    const uid = String(userId);
    return (
        game.organizerId === uid ||
        (game.roles || []).some(
            (r) => r.userId === uid && (r.role === 'MANAGER' || r.role === 'ORGANIZER')
        )
    );
}

async function createParticipantsIgnoringDuplicates(rows) {
    if (!rows.length) return;
    await prisma.chatParticipant.createMany({
        data: rows,
        skipDuplicates: true,
    });
}

/**
 * Batch membership check for many rooms (socket `joinChats`).
 * Happy path is a single ChatParticipant findMany — not one query per room.
 * @returns {Promise<Set<string>>} chatIds the user may join
 */
async function checkChatPermissionsBatch(userId, chatIds) {
    const uid = userId ? String(userId) : '';
    const ids = [...new Set((chatIds || []).map((id) => String(id || '')).filter(Boolean))];
    const allowed = new Set();
    if (!uid || ids.length === 0) return allowed;

    try {
        const members = await prisma.chatParticipant.findMany({
            where: { userId: uid, chatId: { in: ids } },
            select: { chatId: true },
        });
        for (const row of members) allowed.add(row.chatId);

        const missing = ids.filter((id) => !allowed.has(id));
        if (missing.length === 0) return allowed;

        const toCreate = [];

        const gameParts = await prisma.participation.findMany({
            where: {
                userId: uid,
                gameId: { in: missing },
                status: { in: ['CONFIRMED', 'WAITLISTED'] },
            },
            select: { gameId: true },
        });
        for (const p of gameParts) {
            allowed.add(p.gameId);
            toCreate.push({ userId: uid, chatId: p.gameId });
        }

        const stillMissing = missing.filter((id) => !allowed.has(id));
        if (stillMissing.length > 0) {
            const mgrPickGameIds = stillMissing
                .filter((id) => id.startsWith('mgrpick_'))
                .map((id) => id.replace(/^mgrpick_/, ''))
                .filter(Boolean);

            const orFilters = [];
            if (mgrPickGameIds.length) orFilters.push({ id: { in: mgrPickGameIds } });
            orFilters.push({ managerPickChatId: { in: stillMissing } });

            const games = await prisma.game.findMany({
                where: { OR: orFilters },
                include: { roles: { select: { userId: true, role: true } } },
            });

            for (const game of games) {
                if (!isGameManager(game, uid)) continue;
                const pickChatId = `mgrpick_${game.id}`;
                if (stillMissing.includes(pickChatId)) {
                    allowed.add(pickChatId);
                    toCreate.push({ userId: uid, chatId: pickChatId });
                }
                if (game.managerPickChatId && stillMissing.includes(game.managerPickChatId)) {
                    allowed.add(game.managerPickChatId);
                    toCreate.push({ userId: uid, chatId: game.managerPickChatId });
                }
            }
        }

        await createParticipantsIgnoringDuplicates(toCreate);
        return allowed;
    } catch (error) {
        console.error('[chatAuth] Batch chat permission check failed:', error.message);
        return allowed;
    }
}

module.exports = { checkChatPermission, checkChatPermissionsBatch };
