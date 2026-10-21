const cron = require('node-cron');
const { NotificationService } = require('../services/notificationService');
const { prisma } = require('../lib/prisma');
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
let cleanupTask = null;

function startCleanupWorker() {
    if (cleanupTask) return; // idempotent: leader re-acquisition must not stack cron jobs
    // Run daily at 3:00 AM: 0 3 * * *
    cleanupTask = cron.schedule('0 3 * * *', () => {
        cleanupOldNotifications().catch(err => {
            console.error('[CLEANUP_WORKER] Cron execution failed:', err);
        });
    });

    console.log('[CLEANUP_WORKER] Scheduled to run daily at 3:00 AM');
}

/** Stop the cron (job leadership lost / shutdown). */
function stopCleanupWorker() {
    if (!cleanupTask) return;
    try { cleanupTask.stop(); } catch (_) { /* already stopped */ }
    if (typeof cleanupTask.destroy === 'function') {
        try { cleanupTask.destroy(); } catch (_) { /* ignore */ }
    }
    cleanupTask = null;
}

module.exports = { startCleanupWorker, stopCleanupWorker, cleanupOldNotifications };
