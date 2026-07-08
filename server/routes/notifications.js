const express = require('express');
const router = express.Router();
const { NotificationService } = require('../services/notificationService');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../utils/auth');

const prisma = new PrismaClient();
const notificationService = new NotificationService(prisma);

// TEST endpoint - no auth required
router.get('/test', (req, res) => {
    res.json({
        success: true,
        message: 'Notification routes are working!',
        timestamp: new Date().toISOString()
    });
});

// GET /api/notifications - Get all notifications for current user
router.get('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;

        const notifications = await notificationService.getNotifications(userId, limit, offset);
        const unreadCount = await notificationService.getUnreadCount(userId);

        res.json({
            notifications,
            unreadCount,
            hasMore: notifications.length === limit
        });
    } catch (error) {
        console.error('[API] Failed to fetch notifications:', error);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// GET /api/notifications/unread-count - Get unread count
router.get('/unread-count', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const count = await notificationService.getUnreadCount(userId);
        res.json({ count });
    } catch (error) {
        console.error('[API] Failed to get unread count:', error);
        res.status(500).json({ error: 'Failed to get unread count' });
    }
});

// POST /api/notifications/:id/read - Mark notification as read
router.post('/:id/read', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const notificationId = req.params.id;

        await notificationService.markAsRead(notificationId, userId);
        res.json({ success: true });
    } catch (error) {
        console.error('[API] Failed to mark notification as read:', error);
        res.status(500).json({ error: 'Failed to mark notification as read' });
    }
});

// POST /api/notifications/read-all - Mark all notifications as read
router.post('/read-all', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        await notificationService.markAllAsRead(userId);
        res.json({ success: true });
    } catch (error) {
        console.error('[API] Failed to mark all as read:', error);
        res.status(500).json({ error: 'Failed to mark all as read' });
    }
});

// POST /api/notifications/register-device - Register Expo push token (mobile) or legacy FCM token (web)
router.post('/register-device', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { expoPushToken, fcmToken, deviceType, deviceName } = req.body;

        if (!expoPushToken && !fcmToken) {
            return res.status(400).json({ error: 'expoPushToken or fcmToken is required' });
        }

        const device = await notificationService.registerDevice(
            userId,
            { expoPushToken, fcmToken },
            deviceType || 'web',
            deviceName
        );

        res.json({ success: true, device });
    } catch (error) {
        console.error('[API] Failed to register device:', error);
        res.status(500).json({ error: 'Failed to register device' });
    }
});

// DELETE /api/notifications/device/:token - Remove device (matches either token type)
router.delete('/device/:token', authenticateToken, async (req, res) => {
    try {
        const token = req.params.token;
        if (token.startsWith('ExponentPushToken')) {
            await notificationService.removeDevice({ expoPushToken: token });
        } else {
            await notificationService.removeDevice({ fcmToken: token });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('[API] Failed to remove device:', error);
        res.status(500).json({ error: 'Failed to remove device' });
    }
});

// GET /api/notifications/settings - Get notification settings
router.get('/settings', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const settings = await notificationService.getSettings(userId);
        res.json(settings);
    } catch (error) {
        console.error('[API] Failed to get settings:', error);
        res.status(500).json({ error: 'Failed to get settings' });
    }
});

// PUT /api/notifications/settings - Update notification settings
router.put('/settings', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { pushEnabled, friendRequestsEnabled, messagesEnabled, gameRemindersEnabled } = req.body;

        const settings = await notificationService.updateSettings(userId, {
            pushEnabled,
            friendRequestsEnabled,
            messagesEnabled,
            gameRemindersEnabled
        });

        res.json(settings);
    } catch (error) {
        console.error('[API] Failed to update settings:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

module.exports = router;
