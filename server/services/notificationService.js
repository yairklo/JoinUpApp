const admin = require('firebase-admin');
const { Expo } = require('expo-server-sdk');
const { Logger } = require('../utils/logger');
const { decideDelivery, toClientSettings, isMuteActive } = require('../utils/notificationPrefs');
const { redactNotificationFields } = require('../utils/publicName');

// Fan-out batch size: keeps a city-wide send from opening thousands of parallel queries.
const FANOUT_CHUNK = 50;

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
            if (!admin.apps.length) {
                admin.initializeApp({
                    credential: admin.credential.cert({
                        projectId: process.env.FIREBASE_PROJECT_ID,
                        privateKey: process.env.FIREBASE_PRIVATE_KEY
                            ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\+n/g, '\n')
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

// FCM rejects any non-string value in `data`.
function stringifyValues(obj = {}) {
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) {
        if (v === undefined || v === null) continue;
        out[k] = typeof v === 'string' ? v : JSON.stringify(v);
    }
    return out;
}

/**
 * Build the FCM message for a web (PWA) device. DATA-ONLY on purpose: no top-level
 * `notification`, so the browser never auto-displays it and firebase-messaging-sw.js is
 * the single place that shows it (sending both used to produce duplicates). The SW
 * always calls showNotification, which iOS requires — it revokes permission for pushes
 * that show nothing. FCM data values must all be strings.
 */
function buildFcmMessage(token, type, title, body, data = {}) {
    const link = data.link || '/';
    return {
        token,
        data: {
            ...stringifyValues(data),
            type,
            title,
            body,
            notificationId: data.notificationId ? String(data.notificationId) : '',
            link,
            icon: '/icons/web-app-manifest-192x192.png'
        },
        webpush: {
            // Without high urgency, data-only pushes may be delayed on battery-saving devices.
            headers: { Urgency: 'high' },
            fcmOptions: { link }
        },
        // Ignored for web tokens; keeps any legacy native-Android FCM token displaying
        // (the current mobile app uses Expo). No `apns` block: the old content-available
        // flag made it a silent push.
        android: {
            priority: 'high',
            notification: { title, body, icon: 'icon_notification', color: '#000000', channelId: 'default' }
        }
    };
}

class NotificationService {
    constructor(prisma) {
        this.prisma = prisma || require('../lib/prisma').prisma;
        initializeFirebase();
    }

    /**
     * Loads settings + the mutes relevant to this notification for a batch of recipients.
     * Two queries total regardless of recipient count.
     * @returns {Promise<Map<string, {settings: object|null, mutes: object[]}>>}
     */
    async loadPreferences(userIds, ctx = {}) {
        const ids = Array.from(new Set(userIds.filter(Boolean)));
        const result = new Map(ids.map(id => [id, { settings: null, mutes: [] }]));
        if (ids.length === 0) return result;

        const targetIds = [ctx.actorId, ctx.seriesId, ctx.gameId].filter(Boolean);
        const [settingsRows, muteRows] = await Promise.all([
            this.prisma.userNotificationSettings.findMany({ where: { userId: { in: ids } } }),
            targetIds.length
                ? this.prisma.notificationMute.findMany({ where: { userId: { in: ids }, targetId: { in: targetIds } } })
                : Promise.resolve([]),
        ]);
        for (const row of settingsRows) {
            const entry = result.get(row.userId);
            if (entry) entry.settings = row;
        }
        for (const m of muteRows) {
            const entry = result.get(m.userId);
            if (entry) entry.mutes.push(m);
        }
        return result;
    }

    static contextFromData(data = {}) {
        return {
            actorId: data.actorId || null,
            seriesId: data.seriesId || null,
            gameId: data.gameId || null,
        };
    }

    async decideFor(userId, type, data) {
        const ctx = NotificationService.contextFromData(data || {});
        const prefs = (await this.loadPreferences([userId], ctx)).get(userId);
        return decideDelivery({ settings: prefs.settings, mutes: prefs.mutes, type, ctx });
    }

    /**
     * Push-only delivery — no DB row, no in-app notifications feed socket event.
     * Used for chat messages (handled via chat:sync + message counters separately).
     */
    async sendPushOnly(userId, type, title, body, data = {}) {
        try {
            const clean = await redactNotificationFields(this.prisma, title, body, data);
            const decision = await this.decideFor(userId, type, clean.data);
            if (!decision.push) {
                Logger.info('NotificationService', `Push suppressed for ${userId} (${type}: ${decision.reason})`);
                return;
            }
            await this.sendPushToAllDevices(userId, type, clean.title, clean.body, clean.data);
        } catch (error) {
            Logger.error('NotificationService', 'Failed to send push-only notification:', error);
            throw error;
        }
    }

    /**
     * Send notification to user (DB + Push + WebSocket), subject to the user's preferences.
     * Channels the user turned off (or a matching mute) are skipped; returns null when nothing
     * was stored in the in-app feed.
     * @param {string} userId - Recipient user ID
     * @param {string} type - NotificationType enum value
     * @param {string} title - Notification title
     * @param {string} body - Notification body
     * @param {object} data - Additional metadata (gameId, seriesId, actorId, link, ...)
     * @param {object} io - Socket.IO instance (optional, for real-time updates)
     */
    async sendNotification(userId, type, title, body, data = {}, io = null) {
        try {
            const clean = await redactNotificationFields(this.prisma, title, body, data);
            const decision = await this.decideFor(userId, type, clean.data);
            return await this.deliver(userId, type, clean.title, clean.body, clean.data, io, decision);
        } catch (error) {
            Logger.error('NotificationService', 'Failed to send notification:', error);
            throw error;
        }
    }

    /**
     * Same notification to many recipients (city / friends / group fan-out). Preferences are
     * loaded once for the whole batch. A failure for one recipient never affects the others.
     * @param {string[]} userIds
     * @returns {Promise<{ stored: number, pushed: number, skipped: number, failed: number }>}
     */
    async sendNotificationToMany(userIds, type, title, body, data = {}, io = null) {
        const ids = Array.from(new Set((userIds || []).filter(Boolean)));
        const stats = { stored: 0, pushed: 0, skipped: 0, failed: 0 };
        if (ids.length === 0) return stats;

        const clean = await redactNotificationFields(this.prisma, title, body, data);
        title = clean.title;
        body = clean.body;
        data = clean.data;

        const ctx = NotificationService.contextFromData(data || {});
        const prefs = await this.loadPreferences(ids, ctx);
        for (let i = 0; i < ids.length; i += FANOUT_CHUNK) {
            const chunk = ids.slice(i, i + FANOUT_CHUNK);
            const decisions = chunk.map(uid => {
                const p = prefs.get(uid);
                return decideDelivery({ settings: p.settings, mutes: p.mutes, type, ctx });
            });
            const results = await Promise.allSettled(chunk.map((uid, j) =>
                this.deliver(uid, type, title, body, data, io, decisions[j])
            ));
            // Count only what actually went out.
            results.forEach((r, j) => {
                const decision = decisions[j];
                if (!decision.inApp && !decision.push) {
                    stats.skipped++;
                } else if (r.status === 'rejected') {
                    stats.failed++;
                    Logger.error('NotificationService', `Fan-out delivery failed for ${chunk[j]} (${type}):`, r.reason);
                } else {
                    if (decision.inApp) stats.stored++;
                    if (decision.push) stats.pushed++;
                }
            });
        }
        Logger.info('NotificationService', `Fan-out ${type}: ${ids.length} recipients, ${stats.stored} stored, ${stats.pushed} pushed, ${stats.skipped} skipped, ${stats.failed} failed`);
        return stats;
    }

    async deliver(userId, type, title, body, data, io, decision) {
        if (!decision.inApp && !decision.push) {
            Logger.info('NotificationService', `Notification ${type} for ${userId} suppressed (${decision.reason})`);
            return null;
        }

        let notification = null;
        if (decision.inApp) {
            notification = await this.prisma.notification.create({
                data: { userId, type, title, body, data: data || {} }
            });
            Logger.info('NotificationService', `Created notification ${notification.id} for user ${userId}`);
        }

        if (decision.push) {
            await this.sendPushToAllDevices(
                userId, type, title, body,
                notification ? { ...data, notificationId: notification.id } : data
            );
        }

        if (io && notification) {
            io.to(`user_${userId}`).emit('notification', {
                id: notification.id,
                type,
                title,
                body,
                data,
                createdAt: notification.createdAt
            });
        }

        return notification;
    }

    /**
     * Send push notification to all registered devices of a user. Preference checks happen
     * before this is called (decideDelivery) — this only fans out to devices.
     * Devices with an `expoPushToken` are sent via Expo's push service (mobile app);
     * devices with only a legacy `fcmToken` are sent via Firebase (web app).
     */
    async sendPushToAllDevices(userId, type, title, body, data = {}) {
        try {
            const devices = await this.prisma.userDevice.findMany({
                where: { userId }
            });

            if (devices.length === 0) {
                Logger.info('NotificationService', `No devices registered for user ${userId}`);
                return;
            }

            // Fan out by token type - mobile clients use Expo, legacy/web clients use Firebase.
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

        // Prefer English title/body for Expo (mobile) when bilingual fields are present.
        const pushTitle = (typeof data.titleEn === 'string' && data.titleEn.trim()) || title;
        const pushBody = (typeof data.bodyEn === 'string' && data.bodyEn.trim()) || body;

        const messages = validDevices.map(d => ({
            to: d.expoPushToken,
            sound: 'default',
            priority: 'high',
            channelId: 'default',
            title: pushTitle,
            body: pushBody,
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
                await admin.messaging().send(buildFcmMessage(token, type, title, body, data));

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
     * Settings DTO for the client: every preference (defaults filled in) + active mutes with
     * display info. Upsert-on-read so concurrent first reads can't race into a P2002.
     */
    async getSettings(userId) {
        const [settings, mutes] = await Promise.all([
            this.prisma.userNotificationSettings.upsert({
                where: { userId },
                create: { userId },
                update: {},
            }),
            this.listMutes(userId),
        ]);
        return toClientSettings(settings, mutes);
    }

    /** @param {object} data - already validated by sanitizeSettingsUpdate */
    async updateSettings(userId, data) {
        await this.prisma.userNotificationSettings.upsert({
            where: { userId },
            create: { userId, ...data },
            update: data,
        });
        return this.getSettings(userId);
    }

    /** Active mutes joined with a label/image so the settings screen can render them. */
    async listMutes(userId) {
        const now = new Date();
        const rows = (await this.prisma.notificationMute.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
        })).filter(m => isMuteActive(m, now));
        if (rows.length === 0) return [];

        const idsOf = t => rows.filter(r => r.targetType === t).map(r => r.targetId);
        const [users, series, games] = await Promise.all([
            idsOf('USER').length
                ? this.prisma.user.findMany({ where: { id: { in: idsOf('USER') } }, select: { id: true, name: true, imageUrl: true } })
                : [],
            idsOf('SERIES').length
                ? this.prisma.gameSeries.findMany({ where: { id: { in: idsOf('SERIES') } }, select: { id: true, title: true, fieldName: true } })
                : [],
            idsOf('GAME').length
                ? this.prisma.game.findMany({ where: { id: { in: idsOf('GAME') } }, select: { id: true, title: true } })
                : [],
        ]);
        const byKey = new Map();
        users.forEach(u => byKey.set(`USER:${u.id}`, { label: u.name || null, imageUrl: u.imageUrl || null }));
        series.forEach(s => byKey.set(`SERIES:${s.id}`, { label: s.title || s.fieldName || null, imageUrl: null }));
        games.forEach(g => byKey.set(`GAME:${g.id}`, { label: g.title || null, imageUrl: null }));

        return rows.map(r => ({
            targetType: r.targetType,
            targetId: r.targetId,
            until: r.until ? new Date(r.until).toISOString() : null,
            createdAt: new Date(r.createdAt).toISOString(),
            ...(byKey.get(`${r.targetType}:${r.targetId}`) || { label: null, imageUrl: null }),
        }));
    }

    async addMute(userId, { targetType, targetId, until }) {
        await this.prisma.notificationMute.upsert({
            where: { userId_targetType_targetId: { userId, targetType, targetId } },
            create: { userId, targetType, targetId, until },
            update: { until },
        });
        return this.listMutes(userId);
    }

    async removeMute(userId, targetType, targetId) {
        await this.prisma.notificationMute.deleteMany({ where: { userId, targetType, targetId } });
        return this.listMutes(userId);
    }
}

module.exports = { NotificationService, buildFcmMessage };
