const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkNotificationSettings() {
    try {
        const userId = 'user_31YQhOUgigKuo8K0f4fZVs7uPhE'; // Replace with your user ID

        console.log('🔍 Checking notification settings...\n');

        const settings = await prisma.userNotificationSettings.findUnique({
            where: { userId }
        });

        if (!settings) {
            console.log('❌ No settings found for user!');
            console.log('\n📝 Creating default settings with push enabled...');

            const newSettings = await prisma.userNotificationSettings.create({
                data: {
                    userId,
                    pushEnabled: true,
                    friendRequestsEnabled: true,
                    messagesEnabled: true,
                    gameRemindersEnabled: true,
                    gameCancelledEnabled: true,
                    gameUpdatedEnabled: true
                }
            });

            console.log('✅ Settings created:', newSettings);
        } else {
            console.log('📋 Current settings:');
            console.log('  Push Enabled:', settings.pushEnabled);
            console.log('  Friend Requests:', settings.friendRequestsEnabled);
            console.log('  Messages:', settings.messagesEnabled);
            console.log('  Game Reminders:', settings.gameRemindersEnabled);
            console.log('  Game Cancelled:', settings.gameCancelledEnabled);
            console.log('  Game Updated:', settings.gameUpdatedEnabled);

            if (!settings.pushEnabled) {
                console.log('\n⚠️  Push is DISABLED! Enabling it now...');
                await prisma.userNotificationSettings.update({
                    where: { userId },
                    data: { pushEnabled: true }
                });
                console.log('✅ Push enabled!');
            }
        }

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkNotificationSettings();
