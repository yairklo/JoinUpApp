const { ContentModerator } = require('./services/moderationService.js');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const dbDelegate = {
    // Fetch score from DB
    getScore: async (userId) => {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { reputation: true }
        });
        return user ? user.reputation : null;
    },
    // Atomic increment in DB
    incrementScore: async (userId, val) => {
        try {
            await prisma.user.update({
                where: { id: userId },
                data: { reputation: { increment: val } }
            });
        } catch (e) {
            console.error("[DB] Failed to increment score:", e);
        }
    }
};

const moderator = new ContentModerator(dbDelegate);
module.exports = { moderator };
