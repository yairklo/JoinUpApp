const admin = require('firebase-admin');
const { PrismaClient } = require('@prisma/client');
const { Logger } = require('../utils/logger');

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
        // Option 2: Using environment variables
        else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL
                })
            });
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
     * Send push notification to all registered devices of a user
     */
    async sendPushToAllDevices(userId, type, title, body, data = {}) {
        if (!firebaseInitialized) {
            Logger.warn('NotificationService', 'Firebase not initialized, skipping push');
            return;
        }

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

            // 4. Send to all devices
            const tokens = devices.map(d => d.fcmToken);
            const invalidTokens = [];

            for (const token of tokens) {
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

            // 5. Clean up invalid tokens
            if (invalidTokens.length > 0) {
                await this.prisma.userDevice.deleteMany({
                    where: {
                        fcmToken: { in: invalidTokens }
                    }
                });
                Logger.info('NotificationService', `Cleaned up ${invalidTokens.length} invalid tokens`);
            }
        } catch (error) {
            Logger.error('NotificationService', 'Failed to send push notifications:', error);
        }
    }

    /**
     * Register or update a device for a user
     */
    async registerDevice(userId, fcmToken, deviceType = 'web', deviceName = null) {
        try {
            const device = await this.prisma.userDevice.upsert({
                where: { fcmToken },
                create: {
                    userId,
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
     * Remove a device
     */
    async removeDevice(fcmToken) {
        try {
            await this.prisma.userDevice.delete({
                where: { fcmToken }
            });
            Logger.info('NotificationService', `Removed device with token ${fcmToken.substring(0, 20)}...`);
        } catch (error) {
            Logger.error('NotificationService', 'Failed to remove device:', error);
        }
    }

    /**
     * Get user notifications
     */
    async getNotifications(userId, limit = 50, offset = 0) {
        return this.prisma.notification.findMany({
            where: { userId },
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
            where: { userId, read: false }
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
