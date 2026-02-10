const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const { NotificationService } = require('../services/notificationService');

const prisma = new PrismaClient();
const notificationService = new NotificationService(prisma);

/**
 * Game Reminder Worker
 * Runs every 15 minutes to check for games starting in 1 hour
 * Uses idempotent design with reminderSent flag to prevent duplicates
 */
async function sendGameReminders(io = null) {
    console.log('[GAME_REMINDER_WORKER] Checking for upcoming games...');

    try {
        const now = new Date();
        const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

        // Optimized query: only fetch games in the 1-hour window that haven't been reminded
        const upcomingGames = await prisma.game.findMany({
            where: {
                start: {
                    gte: now,
                    lte: oneHourFromNow
                },
                reminderSent: false, // Idempotency: only games not yet reminded
                status: 'OPEN' // Only active games
            },
            include: {
                participants: {
                    where: {
                        status: 'CONFIRMED' // Only confirmed participants
                    },
                    select: {
                        userId: true
                    }
                },
                field: {
                    select: {
                        name: true,
                        location: true
                    }
                }
            }
        });

        console.log(`[GAME_REMINDER_WORKER] Found ${upcomingGames.length} games to remind`);

        for (const game of upcomingGames) {
            const gameTime = game.start.toLocaleTimeString('he-IL', {
                hour: '2-digit',
                minute: '2-digit'
            });

            const title = 'משחק מתקרב!';
            const body = `המשחק שלך ב-${game.field.name} מתחיל בעוד שעה (${gameTime})`;
            const data = {
                gameId: game.id,
                link: `/games/${game.id}`,
                type: 'GAME_REMINDER'
            };

            // Send notification to all confirmed participants
            for (const participant of game.participants) {
                try {
                    await notificationService.sendNotification(
                        participant.userId,
                        'GAME_REMINDER',
                        title,
                        body,
                        data,
                        io // Pass Socket.IO for real-time updates
                    );
                } catch (error) {
                    console.error(`[GAME_REMINDER_WORKER] Failed to send reminder to ${participant.userId}:`, error);
                }
            }

            // Mark as reminded (idempotency)
            await prisma.game.update({
                where: { id: game.id },
                data: { reminderSent: true }
            });

            console.log(`[GAME_REMINDER_WORKER] Sent reminders for game ${game.id} to ${game.participants.length} participants`);
        }

        console.log('[GAME_REMINDER_WORKER] Completed successfully');
    } catch (error) {
        console.error('[GAME_REMINDER_WORKER] Error:', error);
    }
}

/**
 * Start the Cron job
 * Runs every 15 minutes
 */
function startGameReminderWorker(io = null) {
    // Run every 15 minutes: */15 * * * *
    cron.schedule('*/15 * * * *', () => {
        sendGameReminders(io).catch(err => {
            console.error('[GAME_REMINDER_WORKER] Cron execution failed:', err);
        });
    });

    console.log('[GAME_REMINDER_WORKER] Scheduled to run every 15 minutes');

    // Run immediately on startup
    sendGameReminders(io).catch(err => {
        console.error('[GAME_REMINDER_WORKER] Initial execution failed:', err);
    });
}

module.exports = { startGameReminderWorker, sendGameReminders };
