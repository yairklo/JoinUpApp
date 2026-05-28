const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanup() {
  console.log('🧹 Cleaning up test data...');
  // Delete all test games
  const testGames = await prisma.game.findMany({ 
    where: { title: { startsWith: 'Perf Test Game' } }, 
    select: { id: true } 
  });
  const gameIds = testGames.map(g => g.id);

  let deletedGamesCount = 0;
  if (gameIds.length > 0) {
    await prisma.participation.deleteMany({ where: { gameId: { in: gameIds } } });
    await prisma.gameRole.deleteMany({ where: { gameId: { in: gameIds } } });
    await prisma.team.deleteMany({ where: { gameId: { in: gameIds } } });
    const deleteResult = await prisma.game.deleteMany({ where: { id: { in: gameIds } } });
    deletedGamesCount = deleteResult.count;
  }
  
  console.log(`Deleted ${deletedGamesCount} test games (and their dependencies).`);

  // Delete all test users
  const usersDeleted = await prisma.user.deleteMany({ 
    where: { name: { startsWith: 'test_user_' } } 
  });
  console.log(`Deleted ${usersDeleted.count} test users.`);

  // Delete dummy field
  await prisma.field.deleteMany({ 
    where: { name: 'Performance Test Field' } 
  });
  console.log('Deleted dummy field.');

  console.log('✅ Cleanup complete!');
}

cleanup()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
