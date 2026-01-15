const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticateToken } = require('../utils/auth');

// POST /api/chats/private - Get or Create a Private Chat
router.post('/private', authenticateToken, async (req, res) => {
    try {
        const { targetUserId } = req.body;
        const currentUserId = req.user.id; // From auth middleware

        if (!targetUserId) {
            return res.status(400).json({ error: 'Target user ID is required' });
        }

        if (currentUserId === targetUserId) {
            return res.status(400).json({ error: 'Cannot chat with yourself' });
        }

        // 1. Check if a private chat already exists between these two users
        // We look for a chat where both users are participants and type is PRIVATE
        const existingChat = await prisma.chatRoom.findFirst({
            where: {
                type: 'PRIVATE',
                AND: [
                    { participants: { some: { userId: currentUserId } } },
                    { participants: { some: { userId: targetUserId } } }
                ]
            },
            select: { id: true }
        });

        if (existingChat) {
            return res.json({ chatId: existingChat.id });
        }

        // 2. Create new ChatRoom
        const newChat = await prisma.chatRoom.create({
            data: {
                type: 'PRIVATE',
                participants: {
                    create: [
                        { userId: currentUserId },
                        { userId: targetUserId }
                    ]
                }
            },
            select: { id: true }
        });

        res.json({ chatId: newChat.id });
    } catch (error) {
        console.error('Create/Get Private Chat Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/chats/:chatId - Get Chat Details (Optional/Useful)
router.get('/:chatId', authenticateToken, async (req, res) => {
    // ... logic to verify participant and return messages
});


module.exports = router;
