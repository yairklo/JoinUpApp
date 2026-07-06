const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const MOCK_DOMAIN = '@mock.joinup.com';

async function main() {
  console.log(`Starting purge of mock users with email ending in ${MOCK_DOMAIN}...`);

  // 1. Identify all mock users
  const mockUsers = await prisma.user.findMany({
    where: { email: { endsWith: MOCK_DOMAIN } },
    select: { id: true }
  });

  if (mockUsers.length === 0) {
    console.log("No mock users found to purge.");
    return;
  }

  const mockUserIds = mockUsers.map(u => u.id);
  console.log(`Found ${mockUserIds.length} mock users. Purging associated data...`);

  try {
    // 2. Delete participations where the user is a participant
    const partResult = await prisma.participation.deleteMany({
      where: { userId: { in: mockUserIds } }
    });
    console.log(`Deleted ${partResult.count} participations.`);

    // 3. Delete friendships where the user is A or B
    const friendResult = await prisma.friendship.deleteMany({
      where: {
        OR: [
          { userAId: { in: mockUserIds } },
          { userBId: { in: mockUserIds } }
        ]
      }
    });
    console.log(`Deleted ${friendResult.count} friendships.`);

    // 4. Delete game roles where the user is involved
    const roleResult = await prisma.gameRole.deleteMany({
      where: { userId: { in: mockUserIds } }
    });
    console.log(`Deleted ${roleResult.count} game roles.`);

    // 5. Delete games where the mock user is the organizer
    const gamesResult = await prisma.game.deleteMany({
      where: { organizerId: { in: mockUserIds } }
    });
    console.log(`Deleted ${gamesResult.count} games.`);

    // 6. Delete the mock users themselves
    const usersResult = await prisma.user.deleteMany({
      where: { id: { in: mockUserIds } }
    });
    console.log(`Successfully purged ${usersResult.count} mock users.`);

    // Optional: Identify and delete isolated mock fields created by the seed script if they have no games left attached
    // Our seed generated fields containing 'Tel Aviv Field' or 'Jerusalem Field' in their name
    const mockFieldsResult = await prisma.field.deleteMany({
      where: {
        AND: [
          { name: { startsWith: 'Tel Aviv Field' } },
          { games: { none: {} } }
        ]
      }
    });
    
    const mockFieldsJlmResult = await prisma.field.deleteMany({
      where: {
        AND: [
          { name: { startsWith: 'Jerusalem Field' } },
          { games: { none: {} } }
        ]
      }
    });
    
    console.log(`Purged ${mockFieldsResult.count + mockFieldsJlmResult.count} orphaned mock fields.`);

    console.log("Cleanup completed safely!");

  } catch (error) {
    console.error("Error during cleanup purge:", error);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
