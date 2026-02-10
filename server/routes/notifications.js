const express = require('express');
const router = express.Router();
const { NotificationService } = require('../services/notificationService');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const notificationService = new NotificationService(prisma);

// Middleware to extract userId from Clerk auth
// Assumes you have Clerk middleware that sets req.auth.userId
const requireAuth = (req, res, next) => {
    if (!req.auth?.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// GET /api/notifications - Get all notifications for current user
router.get('/', requireAuth, async (req, res) => {
    try {
        const userId = req.auth.userId;
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
router.get('/unread-count', requireAuth, async (req, res) => {
    try {
        const userId = req.auth.userId;
        const count = await notificationService.getUnreadCount(userId);
        res.json({ count });
    } catch (error) {
        console.error('[API] Failed to get unread count:', error);
        res.status(500).json({ error: 'Failed to get unread count' });
    }
});

// POST /api/notifications/:id/read - Mark notification as read
router.post('/:id/read', requireAuth, async (req, res) => {
    try {
        const userId = req.auth.userId;
        const notificationId = req.params.id;

        await notificationService.markAsRead(notificationId, userId);
        res.json({ success: true });
    } catch (error) {
        console.error('[API] Failed to mark notification as read:', error);
        res.status(500).json({ error: 'Failed to mark notification as read' });
    }
});

// POST /api/notifications/read-all - Mark all notifications as read
router.post('/read-all', requireAuth, async (req, res) => {
    try {
        const userId = req.auth.userId;
        await notificationService.markAllAsRead(userId);
        res.json({ success: true });
    } catch (error) {
        console.error('[API] Failed to mark all as read:', error);
        res.status(500).json({ error: 'Failed to mark all as read' });
    }
});

// POST /api/notifications/register-device - Register FCM token
router.post('/register-device', requireAuth, async (req, res) => {
    try {
        const userId = req.auth.userId;
        const { fcmToken, deviceType, deviceName } = req.body;

        if (!fcmToken) {
            return res.status(400).json({ error: 'fcmToken is required' });
        }

        const device = await notificationService.registerDevice(
            userId,
            fcmToken,
            deviceType || 'web',
            deviceName
        );

        res.json({ success: true, device });
    } catch (error) {
        console.error('[API] Failed to register device:', error);
        res.status(500).json({ error: 'Failed to register device' });
    }
});

// DELETE /api/notifications/device/:token - Remove device
router.delete('/device/:token', requireAuth, async (req, res) => {
    try {
        const fcmToken = req.params.token;
        await notificationService.removeDevice(fcmToken);
        res.json({ success: true });
    } catch (error) {
        console.error('[API] Failed to remove device:', error);
        res.status(500).json({ error: 'Failed to remove device' });
    }
});

// GET /api/notifications/settings - Get notification settings
router.get('/settings', requireAuth, async (req, res) => {
    try {
        const userId = req.auth.userId;
        const settings = await notificationService.getSettings(userId);
        res.json(settings);
    } catch (error) {
        console.error('[API] Failed to get settings:', error);
        res.status(500).json({ error: 'Failed to get settings' });
    }
});

// PUT /api/notifications/settings - Update notification settings
router.put('/settings', requireAuth, async (req, res) => {
    try {
        const userId = req.auth.userId;
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
