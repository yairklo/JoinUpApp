const { PrismaClient } = require('@prisma/client');
const { faker } = require('@faker-js/faker');

const prisma = new PrismaClient();

const ANCHOR_USER_ID = 'user_31YQhOUgigKuo8K0f4fZVs7uPhE';
const NUM_USERS = 500;
const DIRECT_FRIENDS_COUNT = 20;
const NUM_GAMES = 1000;

const MOCK_DOMAIN = '@mock.joinup.com';

const SPORT_TYPES = ['SOCCER', 'BASKETBALL', 'TENNIS'];

async function getOrCreateFields() {
  let fields = await prisma.field.findMany();
  
  if (fields.length === 0) {
    console.log("No fields found. Creating 10 mock fields (5 Tel Aviv, 5 Jerusalem)...");
    
    // Tel Aviv cluster
    for (let i = 0; i < 5; i++) {
      await prisma.field.create({
        data: {
          name: `Tel Aviv Field ${i + 1}`,
          location: `TLV Street ${i + 1}`,
          city: 'תל אביב-יפו',
          type: 'PUBLIC',
          lat: faker.location.latitude({ min: 32.05, max: 32.12 }),
          lng: faker.location.longitude({ min: 34.76, max: 34.82 }),
        }
      });
    }

    // Jerusalem cluster
    for (let i = 0; i < 5; i++) {
      await prisma.field.create({
        data: {
          name: `Jerusalem Field ${i + 1}`,
          location: `JLM Street ${i + 1}`,
          city: 'ירושלים',
          type: 'PUBLIC',
          lat: faker.location.latitude({ min: 31.75, max: 31.82 }),
          lng: faker.location.longitude({ min: 35.18, max: 35.25 }),
        }
      });
    }
    fields = await prisma.field.findMany();
  }

  return fields;
}

function getRandomDate() {
  const now = new Date();
  const r = Math.random();
  let daysToAdd = 0;

  if (r < 0.3) {
    // 30% next 72 hours (days 1-3)
    daysToAdd = faker.number.int({ min: 1, max: 3 });
  } else if (r < 0.8) {
    // 50% rest of the week (days 4-7)
    daysToAdd = faker.number.int({ min: 4, max: 7 });
  } else {
    // 20% following week (days 8-14)
    daysToAdd = faker.number.int({ min: 8, max: 14 });
  }

  const d = new Date(now);
  d.setDate(d.getDate() + daysToAdd);
  // Hours between 6:00 and 23:00
  const hour = faker.number.int({ min: 6, max: 23 });
  d.setHours(hour, 0, 0, 0);

  return d;
}

async function main() {
  console.log("Starting DB seeding...");

  // 1. Ensure the Anchor User exists
  const anchorExists = await prisma.user.findUnique({ where: { id: ANCHOR_USER_ID } });
  if (!anchorExists) {
    console.warn(`Anchor user ${ANCHOR_USER_ID} not found. Some functionality might not link properly, but proceeding with mock users...`);
  }

  // 2. Generate 500+ fake users
  console.log(`Generating ${NUM_USERS} mock users...`);
  const mockUsers = [];
  for (let i = 0; i < NUM_USERS; i++) {
    const fn = faker.person.firstName();
    const ln = faker.person.lastName();
    const mockUser = await prisma.user.create({
      data: {
        id: `mock_${faker.string.uuid()}`,
        name: `${fn} ${ln}`,
        email: `${faker.string.alphanumeric(8)}_${i}${MOCK_DOMAIN}`,
        city: faker.helpers.arrayElement(['תל אביב-יפו', 'ירושלים', 'חיפה', 'ראשון לציון']),
        imageUrl: faker.image.avatar(),
        birthDate: faker.date.birthdate({ min: 18, max: 45, mode: 'age' }),
      }
    });
    mockUsers.push(mockUser);
  }

  // 3. Connect 1st degree friends
  console.log(`Creating 1st-degree friendships (Connecting ${DIRECT_FRIENDS_COUNT} to anchor)...`);
  const directFriends = mockUsers.slice(0, DIRECT_FRIENDS_COUNT);
  const remainingUsers = mockUsers.slice(DIRECT_FRIENDS_COUNT);

  if (anchorExists) {
    for (const friend of directFriends) {
      await prisma.friendship.create({
        data: {
          userAId: ANCHOR_USER_ID,
          userBId: friend.id,
        }
      });
    }
  }

  // 4. Connect 2nd degree friends
  console.log(`Creating 2nd-degree friendships...`);
  for (const user of remainingUsers) {
    // Assign 1-3 direct friends to this remaining user to ensure graph connectivity
    const numConnections = faker.number.int({ min: 1, max: 3 });
    const selectedDirectFriends = faker.helpers.arrayElements(directFriends, numConnections);
    
    for (const dFriend of selectedDirectFriends) {
      // Create friendship (A or B order doesn't matter for the recursive CTE)
      await prisma.friendship.create({
        data: {
          userAId: user.id,
          userBId: dFriend.id,
        }
      });
    }
  }

  // 5. High-Volume Game Generation
  console.log(`Fetching fields and generating ${NUM_GAMES} games...`);
  const fields = await getOrCreateFields();

  let gamesCreated = 0;
  for (let i = 0; i < NUM_GAMES; i++) {
    const field = faker.helpers.arrayElement(fields);
    const date = getRandomDate();
    const sport = faker.helpers.arrayElement(SPORT_TYPES);
    const organizer = faker.helpers.arrayElement(mockUsers);

    // Number of participants (2 to 10)
    const numParticipants = faker.number.int({ min: 2, max: 10 });
    const participants = faker.helpers.arrayElements(mockUsers, numParticipants);
    // Ensure organizer is a participant
    if (!participants.find(p => p.id === organizer.id)) {
      participants[0] = organizer;
    }

    await prisma.game.create({
      data: {
        title: `${faker.word.adjective()} ${sport} Match`,
        fieldId: field.id,
        start: date,
        duration: faker.number.int({ min: 1, max: 2 }),
        maxPlayers: faker.number.int({ min: 10, max: 20 }),
        price: faker.number.int({ min: 0, max: 50 }),
        isOpenToJoin: true,
        isFriendsOnly: false,
        organizerId: organizer.id,
        sport: sport,
        customLat: field.lat,
        customLng: field.lng,
        customLocation: field.location,
        participants: {
          create: participants.map(p => ({
            userId: p.id,
            status: 'CONFIRMED'
          }))
        }
      }
    });

    gamesCreated++;
    if (gamesCreated % 100 === 0) {
      console.log(`Created ${gamesCreated} / ${NUM_GAMES} games...`);
    }
  }

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
