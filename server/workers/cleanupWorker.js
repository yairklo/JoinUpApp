const cron = require('node-cron');
const { NotificationService } = require('../services/notificationService');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const notificationService = new NotificationService(prisma);

/**
 * Cleanup Worker
 * Deletes notifications older than 30 days to maintain database performance
 */
async function cleanupOldNotifications() {
    console.log('[CLEANUP_WORKER] Starting notification cleanup...');

    try {
        const deletedCount = await notificationService.cleanupOldNotifications(30);
        console.log(`[CLEANUP_WORKER] Deleted ${deletedCount} old notifications`);
    } catch (error) {
        console.error('[CLEANUP_WORKER] Error:', error);
    }
}

/**
 * Start the Cron job
 * Runs daily at 3:00 AM
 */
function startCleanupWorker() {
    // Run daily at 3:00 AM: 0 3 * * *
    cron.schedule('0 3 * * *', () => {
        cleanupOldNotifications().catch(err => {
            console.error('[CLEANUP_WORKER] Cron execution failed:', err);
        });
    });

    console.log('[CLEANUP_WORKER] Scheduled to run daily at 3:00 AM');
}

module.exports = { startCleanupWorker, cleanupOldNotifications };
