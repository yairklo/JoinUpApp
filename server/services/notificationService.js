const admin = require('firebase-admin');
const { Expo } = require('expo-server-sdk');
const { PrismaClient } = require('@prisma/client');
const { Logger } = require('../utils/logger');

// Expo push client (no credentials required - Expo's push service handles APNs/FCM delivery internally)
const expo = new Expo();

// Initialize Firebase Admin (only once)
let firebaseInitialized = false;

function initializeFirebase() {
    if (firebaseInitialized) return;

    try {
        // Option 1: Using service account JSON file
        if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
            const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        }
        // Option 2: Using environment variables (works on both local dotenv and Render)
        else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
            const rawKey = process.env.FIREBASE_PRIVATE_KEY;
            if (rawKey) {
                console.log('[DEBUG KEY] Starts with:', JSON.stringify(rawKey.substring(0, 40)));
                console.log('[DEBUG KEY] Ends with:', JSON.stringify(rawKey.substring(rawKey.length - 40)));
                console.log('[DEBUG KEY] Contains raw newlines (\\n as text):', rawKey.includes('\\n'));
                console.log('[DEBUG KEY] Contains real newlines:', rawKey.includes('\n'));
            } else {
                console.log('[DEBUG KEY] FIREBASE_PRIVATE_KEY is undefined');
            }
            if (!admin.apps.length) {
                admin.initializeApp({
                    credential: admin.credential.cert({
                        projectId: process.env.FIREBASE_PROJECT_ID,
                        privateKey: process.env.FIREBASE_PRIVATE_KEY
                            ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
                            : undefined,
                        clientEmail: process.env.FIREBASE_CLIENT_EMAIL
                    })
                });
            }
        } else {
            Logger.warn('NotificationService', 'Firebase credentials not found. Push notifications disabled.');
            return;
        }

        firebaseInitialized = true;
        Logger.info('NotificationService', 'Firebase Admin initialized successfully');
    } catch (error) {
        Logger.error('NotificationService', 'Failed to initialize Firebase:', error);
    }
}

class NotificationService {
    constructor(prisma) {
        this.prisma = prisma || new PrismaClient();
        initializeFirebase();
    }

    /**
     * Push-only delivery — no DB row, no in-app notifications feed socket event.
     * Used for chat messages (handled via chat:sync + message counters separately).
     */
    async sendPushOnly(userId, type, title, body, data = {}) {
        try {
            await this.sendPushToAllDevices(userId, type, title, body, data);
        } catch (error) {
            Logger.error('NotificationService', 'Failed to send push-only notification:', error);
            throw error;
        }
    }

    /**
     * Send notification to user (DB + Push + WebSocket)
     * @param {string} userId - Recipient user ID
     * @param {string} type - NotificationType enum value
     * @param {string} title - Notification title
     * @param {string} body - Notification body
     * @param {object} data - Additional metadata (gameId, link, etc.)
     * @param {object} io - Socket.IO instance (optional, for real-time updates)
     */
    async sendNotification(userId, type, title, body, data = {}, io = null) {
        try {
            // 1. Save to database
            const notification = await this.prisma.notification.create({
                data: {
                    userId,
                    type,
                    title,
                    body,
                    data: data || {}
                }
            });

            Logger.info('NotificationService', `Created notification ${notification.id} for user ${userId}`);

            // 2. Send push notification to all user devices
            await this.sendPushToAllDevices(userId, type, title, body, data);

            // 3. Send real-time WebSocket event (if io is provided)
            if (io) {
                io.to(`user_${userId}`).emit('notification', {
                    id: notification.id,
                    type,
                    title,
                    body,
                    data,
                    createdAt: notification.createdAt
                });
                Logger.info('NotificationService', `Sent WebSocket notification to user_${userId}`);
            }

            return notification;
        } catch (error) {
            Logger.error('NotificationService', 'Failed to send notification:', error);
            throw error;
        }
    }

    /**
     * Send push notification to all registered devices of a user.
     * Devices with an `expoPushToken` are sent via Expo's push service (mobile app);
     * devices with only a legacy `fcmToken` are sent via Firebase (web app).
     */
    async sendPushToAllDevices(userId, type, title, body, data = {}) {
        try {
            // 1. Check user notification settings (optional - use defaults if table doesn't exist)
            let settings = null;
            try {
                settings = await this.prisma.userNotificationSettings.findUnique({
                    where: { userId }
                });
            } catch (error) {
                // Table doesn't exist - use default settings (all enabled)
                Logger.info('NotificationService', 'UserNotificationSettings table not found, using defaults');
                settings = {
                    pushEnabled: true,
                    friendRequestsEnabled: true,
                    messagesEnabled: true,
                    gameRemindersEnabled: true
                };
            }

            // If settings exist and push is explicitly disabled, skip
            if (settings && settings.pushEnabled === false) {
                Logger.info('NotificationService', `Push disabled for user ${userId}`);
                return;
            }

            // 2. Check type-specific settings (only if settings exist)
            if (settings) {
                if (type === 'FRIEND_REQUEST' && settings.friendRequestsEnabled === false) return;
                if (type === 'NEW_MESSAGE' && settings.messagesEnabled === false) return;
                if (type === 'GAME_REMINDER' && settings.gameRemindersEnabled === false) return;
            }

            // 3. Get all user devices
            const devices = await this.prisma.userDevice.findMany({
                where: { userId }
            });

            if (devices.length === 0) {
                Logger.info('NotificationService', `No devices registered for user ${userId}`);
                return;
            }

            // 4. Fan out by token type - mobile clients use Expo, legacy/web clients use Firebase.
            // A device with both tokens is only sent via Expo to avoid a duplicate push.
            const expoDevices = devices.filter(d => d.expoPushToken);
            const fcmDevices = devices.filter(d => !d.expoPushToken && d.fcmToken);

            await Promise.all([
                this.sendExpoPush(expoDevices, type, title, body, data),
                this.sendFirebasePush(fcmDevices, type, title, body, data)
            ]);
        } catch (error) {
            Logger.error('NotificationService', 'Failed to send push notifications:', error);
        }
    }

    /**
     * Send push via Expo's push service (mobile app devices - expo-notifications)
     */
    async sendExpoPush(devices, type, title, body, data = {}) {
        if (devices.length === 0) return;

        const validDevices = devices.filter(d => Expo.isExpoPushToken(d.expoPushToken));
        const invalidTokens = devices
            .filter(d => !Expo.isExpoPushToken(d.expoPushToken))
            .map(d => d.expoPushToken);

        if (invalidTokens.length > 0) {
            Logger.warn('NotificationService', `Skipping ${invalidTokens.length} malformed Expo push token(s)`);
        }

        if (validDevices.length === 0) return;

        const messages = validDevices.map(d => ({
            to: d.expoPushToken,
            sound: 'default',
            title,
            body,
            data: { ...data, type, notificationId: data.notificationId || '', link: data.link || '/' }
        }));

        const chunks = expo.chunkPushNotifications(messages);
        const tickets = [];
        for (const chunk of chunks) {
            try {
                const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
                tickets.push(...ticketChunk);
            } catch (error) {
                Logger.error('NotificationService', 'Failed to send Expo push chunk:', error);
            }
        }

        // Clean up tokens that Expo reports as no longer registered
        const staleTokens = [];
        tickets.forEach((ticket, i) => {
            if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
                staleTokens.push(validDevices[i].expoPushToken);
            }
        });

        if (staleTokens.length > 0) {
            await this.prisma.userDevice.deleteMany({ where: { expoPushToken: { in: staleTokens } } });
            Logger.info('NotificationService', `Cleaned up ${staleTokens.length} stale Expo token(s)`);
        }
    }

    /**
     * Send push via Firebase Admin (legacy web app devices - FCM tokens)
     */
    async sendFirebasePush(devices, type, title, body, data = {}) {
        if (devices.length === 0) return;
        if (!firebaseInitialized) {
            Logger.warn('NotificationService', 'Firebase not initialized, skipping FCM push');
            return;
        }

        const invalidTokens = [];

        for (const device of devices) {
            const token = device.fcmToken;
            try {
                await admin.messaging().send({
                    token,
                    // notification: { title, body }, // REMOVED to prevent double notification
                    data: {
                        ...data,
                        type,
                        title, // Send title in data
                        body,  // Send body in data
                        notificationId: data.notificationId || '',
                        link: data.link || '/',
                        icon: '/icons/web-app-manifest-192x192.png'
                    },
                    webpush: {
                        fcmOptions: {
                            link: data.link || '/'
                        }
                    },
                    android: {
                        priority: 'high',
                        notification: {
                            icon: 'icon_notification',
                            color: '#000000',
                            clickAction: 'FLUTTER_NOTIFICATION_CLICK' // Standard for many handlers, but we will handle in SW
                        }
                    },
                    apns: {
                        payload: {
                            aps: {
                                contentAvailable: true,
                                sound: 'default'
                            }
                        }
                    }
                });

                Logger.info('NotificationService', `Push sent to token ${token.substring(0, 20)}...`);
            } catch (error) {
                // Handle invalid tokens
                if (error.code === 'messaging/invalid-registration-token' ||
                    error.code === 'messaging/registration-token-not-registered') {
                    invalidTokens.push(token);
                    Logger.warn('NotificationService', `Invalid token: ${token.substring(0, 20)}...`);
                } else {
                    Logger.error('NotificationService', `Failed to send push to token ${token.substring(0, 20)}:`, error);
                }
            }
        }

        // Clean up invalid tokens
        if (invalidTokens.length > 0) {
            await this.prisma.userDevice.deleteMany({
                where: {
                    fcmToken: { in: invalidTokens }
                }
            });
            Logger.info('NotificationService', `Cleaned up ${invalidTokens.length} invalid tokens`);
        }
    }

    /**
     * Register or update a device for a user. Accepts either an Expo push token (mobile)
     * or an FCM token (legacy/web); exactly one should be provided per call.
     */
    async registerDevice(userId, { expoPushToken = null, fcmToken = null } = {}, deviceType = 'web', deviceName = null) {
        if (!expoPushToken && !fcmToken) {
            throw new Error('Either expoPushToken or fcmToken is required');
        }
        try {
            const where = expoPushToken ? { expoPushToken } : { fcmToken };
            const device = await this.prisma.userDevice.upsert({
                where,
                create: {
                    userId,
                    expoPushToken,
                    fcmToken,
                    deviceType,
                    deviceName,
                    lastUsed: new Date()
                },
                update: {
                    userId, // Update userId in case token was reassigned
                    deviceType,
                    deviceName,
                    lastUsed: new Date()
                }
            });

            Logger.info('NotificationService', `Registered device ${device.id} for user ${userId}`);
            return device;
        } catch (error) {
            Logger.error('NotificationService', 'Failed to register device:', error);
            throw error;
        }
    }

    /**
     * Remove a device by either token type
     */
    async removeDevice({ expoPushToken = null, fcmToken = null } = {}) {
        try {
            const where = expoPushToken ? { expoPushToken } : { fcmToken };
            await this.prisma.userDevice.delete({ where });
            Logger.info('NotificationService', `Removed device with token ${(expoPushToken || fcmToken || '').substring(0, 20)}...`);
        } catch (error) {
            Logger.error('NotificationService', 'Failed to remove device:', error);
        }
    }

    /**
     * Get user notifications
     */
    async getNotifications(userId, limit = 50, offset = 0) {
        return this.prisma.notification.findMany({
            where: {
                userId,
                // Chat messages use chat:sync + counters — never belong in the general feed
                type: { not: 'NEW_MESSAGE' },
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset
        });
    }

    /**
     * Get unread count
     */
    async getUnreadCount(userId) {
        return this.prisma.notification.count({
            where: {
                userId,
                read: false,
                type: { not: 'NEW_MESSAGE' },
            }
        });
    }

    /**
     * Mark notification as read
     */
    async markAsRead(notificationId, userId) {
        return this.prisma.notification.updateMany({
            where: { id: notificationId, userId },
            data: { read: true }
        });
    }

    /**
     * Mark all notifications as read
     */
    async markAllAsRead(userId) {
        return this.prisma.notification.updateMany({
            where: { userId, read: false },
            data: { read: true }
        });
    }

    /**
     * Delete old notifications (TTL cleanup)
     * @param {number} daysOld - Delete notifications older than this many days
     */
    async cleanupOldNotifications(daysOld = 30) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);

        const result = await this.prisma.notification.deleteMany({
            where: {
                createdAt: { lt: cutoffDate }
            }
        });

        Logger.info('NotificationService', `Cleaned up ${result.count} notifications older than ${daysOld} days`);
        return result.count;
    }

    /**
     * Get or create notification settings for a user
     */
    async getSettings(userId) {
        let settings = await this.prisma.userNotificationSettings.findUnique({
            where: { userId }
        });

        if (!settings) {
            settings = await this.prisma.userNotificationSettings.create({
                data: { userId }
            });
        }

        return settings;
    }

    /**
     * Update notification settings
     */
    async updateSettings(userId, updates) {
        return this.prisma.userNotificationSettings.upsert({
            where: { userId },
            create: { userId, ...updates },
            update: updates
        });
    }
}

module.exports = { NotificationService };
