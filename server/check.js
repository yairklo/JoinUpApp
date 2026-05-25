const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    try {
        const chatId = 'cmosf5ph60007e349nse19r6a';
        
        // 1. Does the chat exist?
        const chat = await prisma.chatRoom.findUnique({ where: { id: chatId } });
        console.log('Chat exists:', !!chat);
        
        // 2. Does a game exist with this ID?
        const game = await prisma.game.findUnique({ where: { id: chatId } });
        console.log('Game exists with this ID:', !!game);
        
        if (game) {
            // 3. Who are the participants in this game?
            const parts = await prisma.participation.findMany({ where: { gameId: chatId } });
            console.log('Game Participants (userIds):', parts.map(p => p.userId));
        }

        // 4. Who are the participants in the chat?
        const chatParts = await prisma.chatParticipant.findMany({ where: { chatId: chatId } });
        console.log('Chat Participants (userIds):', chatParts.map(p => p.userId));
        
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
check();
