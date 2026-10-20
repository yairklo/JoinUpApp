#!/usr/bin/env node
/**
 * Idempotent reset + seed of the FIXED dev dataset only.
 *
 * Refuses to run if the environment looks like production (see seedDevGuard.js).
 * Re-running deletes the previous seed rows (ids prefixed seed_, plus games
 * titled "e2e …" created by these users) and writes them again. It does not
 * drop unrelated rows.
 *
 * Usage (from server/):
 *   JOINUP_SEED_CONFIRM=dev npm run seed:dev
 *
 * Requires CLERK_SECRET_KEY=sk_test_… and DATABASE_URL / DIRECT_DATABASE_URL
 * for the Neon dev branch (or local Postgres). Writes server/fixtures/devSeed.json.
 *
 * Clerk dev test mode: emails below sign in with code 424242.
 * Do not call the recurring group a «סדרה» — the product word is «קבוצה».
 */
const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env.development') });

const { assertSafeToSeed } = require('./seedDevGuard');

const VERIFICATION_CODE = '424242';
const FIXTURE_PATH = path.join(__dirname, '..', 'fixtures', 'devSeed.json');
const LEGAL_VERSION = require('../shared/ageGate').LEGAL_VERSION;
const { parseJerusalemTimeToUTC } = require('../shared/timezone');

const ACCOUNTS = [
  {
    key: 'adultA',
    email: 'adult-a+clerk_test@example.com',
    firstName: 'נועה',
    lastName: 'כהן',
    birthDate: '1992-04-15',
    city: 'תל אביב-יפו',
    role: 'adult',
  },
  {
    key: 'adultB',
    email: 'adult-b+clerk_test@example.com',
    firstName: 'יונתן',
    lastName: 'לוי',
    birthDate: '1990-08-02',
    city: 'חיפה',
    role: 'adult',
  },
  {
    key: 'minorC',
    email: 'minor-c+clerk_test@example.com',
    firstName: 'מאיה',
    lastName: 'אביב',
    birthDate: '2012-06-01',
    city: 'ירושלים',
    role: 'minor',
  },
  {
    key: 'organizerO',
    email: 'organizer-o+clerk_test@example.com',
    firstName: 'עומר',
    lastName: 'דהן',
    birthDate: '1988-01-20',
    city: 'תל אביב-יפו',
    role: 'organizer',
  },
];

const FIELDS = [
  { id: 'seed_field_tlv', name: 'מגרש סיד תל אביב', location: 'פארק הירקון, תל אביב-יפו', city: 'תל אביב-יפו', lat: 32.0853, lng: 34.7818, sports: ['SOCCER'] },
  { id: 'seed_field_haifa', name: 'מגרש סיד חיפה', location: 'הדר, חיפה', city: 'חיפה', lat: 32.794, lng: 34.9896, sports: ['BASKETBALL'] },
  { id: 'seed_field_jerusalem', name: 'מגרש סיד ירושלים', location: 'גבעת רם, ירושלים', city: 'ירושלים', lat: 31.7683, lng: 35.2137, sports: ['SOCCER'] },
  { id: 'seed_field_beer_sheva', name: 'מגרש סיד באר שבע', location: 'העיר העתיקה, באר שבע', city: 'באר שבע', lat: 31.2518, lng: 34.7913, sports: ['BASKETBALL'] },
];

function fullName(account) {
  return `${account.firstName} ${account.lastName}`;
}

function jerusalemDatePlus(days) {
  const when = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(when);
}

function jerusalemWeekday(date) {
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    weekday: 'short',
  }).format(date);
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[label];
}

function orderPair(a, b) {
  return a < b ? [a, b] : [b, a];
}

function assertNoSeriesWord(text) {
  if (String(text).includes('סדרה')) {
    throw new Error(`Seed copy must say קבוצה, not סדרה: ${text}`);
  }
}

async function upsertClerkUser(clerk, account) {
  const list = await clerk.users.getUserList({ emailAddress: [account.email], limit: 10 });
  const rows = Array.isArray(list) ? list : (list.data || []);
  const found = rows.find((user) => (user.emailAddresses || []).some(
    (entry) => String(entry.emailAddress || '').toLowerCase() === account.email,
  ));
  if (found) {
    await clerk.users.updateUser(found.id, {
      firstName: account.firstName,
      lastName: account.lastName,
    });
    return found.id;
  }
  const created = await clerk.users.createUser({
    emailAddress: [account.email],
    firstName: account.firstName,
    lastName: account.lastName,
    skipPasswordChecks: true,
    skipPasswordRequirement: true,
  });
  return created.id;
}

async function resetSeed(prisma, userIds) {
  const seedGames = await prisma.game.findMany({
    where: {
      OR: [
        { id: { startsWith: 'seed_' } },
        ...(userIds.length ? [{ organizerId: { in: userIds }, title: { startsWith: 'e2e ' } }] : []),
      ],
    },
    select: { id: true },
  });
  const gameIds = seedGames.map((game) => game.id);
  const chatIds = [...new Set([...gameIds, 'seed_chat_a_c'])];

  if (chatIds.length) {
    await prisma.reaction.deleteMany({ where: { message: { chatRoomId: { in: chatIds } } } });
    await prisma.messageEdit.deleteMany({ where: { message: { chatRoomId: { in: chatIds } } } });
    await prisma.message.deleteMany({ where: { chatRoomId: { in: chatIds } } });
    await prisma.chatParticipant.deleteMany({ where: { chatId: { in: chatIds } } });
    await prisma.chatRoom.deleteMany({ where: { id: { in: chatIds } } });
  }

  if (userIds.length) {
    await prisma.userBlock.deleteMany({
      where: { OR: [{ blockerId: { in: userIds } }, { blockedId: { in: userIds } }] },
    });
    await prisma.flaggedMessage.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.friendRequest.deleteMany({
      where: { OR: [{ requesterId: { in: userIds } }, { receiverId: { in: userIds } }] },
    });
    await prisma.friendship.deleteMany({
      where: { OR: [{ userAId: { in: userIds } }, { userBId: { in: userIds } }] },
    });
  }

  if (gameIds.length) {
    await prisma.userRating.deleteMany({ where: { gameId: { in: gameIds } } });
    await prisma.playerTrade.deleteMany({ where: { gameId: { in: gameIds } } });
    await prisma.participation.deleteMany({ where: { gameId: { in: gameIds } } });
    await prisma.gameRole.deleteMany({ where: { gameId: { in: gameIds } } });
    await prisma.team.deleteMany({ where: { gameId: { in: gameIds } } });
    await prisma.game.deleteMany({ where: { id: { in: gameIds } } });
  }

  const seriesIds = ['seed_series_weekly', 'seed_series_blocked'];
  await prisma.seriesJoinRequest.deleteMany({ where: { seriesId: { in: seriesIds } } });
  await prisma.seriesParticipant.deleteMany({ where: { seriesId: { in: seriesIds } } });
  await prisma.gameSeries.deleteMany({ where: { id: { in: seriesIds } } });
  await prisma.field.deleteMany({ where: { id: { in: FIELDS.map((field) => field.id) } } });
}

async function upsertDbUser(prisma, account, id) {
  const existing = await prisma.user.findUnique({ where: { email: account.email } });
  if (existing && existing.id !== id) {
    throw new Error(`Email ${account.email} belongs to ${existing.id}, not Clerk user ${id}. Refusing to overwrite it.`);
  }
  const now = new Date();
  const data = {
    email: account.email,
    name: fullName(account),
    city: account.city,
    birthDate: new Date(`${account.birthDate}T00:00:00.000Z`),
    termsAcceptedAt: now,
    termsVersion: LEGAL_VERSION,
    guardianConsentAt: account.role === 'minor' ? now : null,
    // Null privacy columns: minors resolve to FRIENDS_ONLY, adults to EVERYONE.
    privacyFriends: null,
    privacyGames: null,
    privacyMessages: null,
  };
  await prisma.user.upsert({
    where: { id },
    update: data,
    create: { id, ...data },
  });
}

async function createGame(prisma, spec) {
  const confirmed = [...new Set(spec.confirmedUserIds)];
  await prisma.game.create({
    data: {
      id: spec.id,
      fieldId: spec.fieldId,
      organizerId: spec.organizerId,
      start: spec.start,
      duration: 1.5,
      maxPlayers: 14,
      sport: spec.sport,
      title: spec.title,
      description: spec.description || '',
      status: 'OPEN',
      isOpenToJoin: true,
      isFriendsOnly: !!spec.isFriendsOnly,
      friendsOnlyLinkPolicy: spec.friendsOnlyLinkPolicy || 'REQUEST_TO_JOIN',
      joinPolicy: spec.joinPolicy || 'INSTANT',
      seriesId: spec.seriesId || null,
      participants: {
        create: [
          ...confirmed.map((userId) => ({ userId, status: 'CONFIRMED' })),
          ...(spec.pendingUserId ? [{ userId: spec.pendingUserId, status: 'PENDING' }] : []),
        ],
      },
      roles: { create: { userId: spec.organizerId, role: 'ORGANIZER' } },
    },
  });
  await prisma.chatRoom.create({
    data: {
      id: spec.id,
      type: 'GROUP',
      participants: { create: confirmed.map((userId) => ({ userId })) },
    },
  });
}

async function main() {
  assertSafeToSeed(process.env);

  const { execSync } = require('child_process');
  const serverDir = path.join(__dirname, '..');
  if (process.env.SEED_SKIP_MIGRATE !== '1') {
    execSync('npx prisma generate && npx prisma migrate deploy', {
      cwd: serverDir,
      stdio: 'inherit',
      env: process.env,
    });
  }

  const { createClerkClient } = require('@clerk/backend');
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const { prisma } = require('../lib/prisma');

  try {
    const ids = {};
    for (const account of ACCOUNTS) {
      ids[account.key] = await upsertClerkUser(clerk, account);
    }

    const emails = ACCOUNTS.map((account) => account.email);
    const prior = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    });
    const userIds = [...new Set([...Object.values(ids), ...prior.map((row) => row.id)])];
    await resetSeed(prisma, userIds);

    for (const account of ACCOUNTS) {
      await upsertDbUser(prisma, account, ids[account.key]);
    }

    const [friendA, friendB] = orderPair(ids.adultA, ids.adultB);
    await prisma.friendship.create({ data: { userAId: friendA, userBId: friendB } });

    for (const field of FIELDS) {
      await prisma.field.create({
        data: {
          id: field.id,
          name: field.name,
          location: field.location,
          city: field.city,
          type: 'OPEN',
          lat: field.lat,
          lng: field.lng,
          supportedSports: field.sports,
        },
      });
    }

    const o = ids.organizerO;
    const a = ids.adultA;
    const b = ids.adultB;
    const c = ids.minorC;

    const weeklyStart = parseJerusalemTimeToUTC(jerusalemDatePlus(3), '19:00');
    const weeklyTitle = 'קבוצה שבועית תל אביב';
    const blockedSeriesTitle = 'קבוצה סגורה לחברים';
    assertNoSeriesWord(weeklyTitle);
    assertNoSeriesWord(blockedSeriesTitle);

    await prisma.gameSeries.create({
      data: {
        id: 'seed_series_weekly',
        organizerId: o,
        fieldId: 'seed_field_tlv',
        fieldName: 'מגרש סיד תל אביב',
        fieldLocation: 'פארק הירקון, תל אביב-יפו',
        maxPlayers: 14,
        dayOfWeek: jerusalemWeekday(weeklyStart),
        time: '19:00',
        duration: 1.5,
        sport: 'SOCCER',
        title: weeklyTitle,
        description: 'מפגש קבוע, פתוח להצטרפות',
        isOpenToJoin: true,
        isFriendsOnly: false,
        subscribers: { create: [{ userId: o, role: 'MANAGER' }] },
      },
    });

    await prisma.gameSeries.create({
      data: {
        id: 'seed_series_blocked',
        organizerId: o,
        fieldId: 'seed_field_haifa',
        fieldName: 'מגרש סיד חיפה',
        fieldLocation: 'הדר, חיפה',
        maxPlayers: 10,
        dayOfWeek: jerusalemWeekday(weeklyStart),
        time: '20:00',
        duration: 1.5,
        sport: 'BASKETBALL',
        title: blockedSeriesTitle,
        description: 'פתוחה לחברים של המארגן בלבד',
        isOpenToJoin: true,
        isFriendsOnly: true,
        friendsOnlyLinkPolicy: 'BLOCKED',
        subscribers: { create: [{ userId: o, role: 'MANAGER' }] },
      },
    });

    const games = [
      {
        key: 'tlvSoccer',
        id: 'seed_game_tlv_soccer',
        fieldId: 'seed_field_tlv',
        sport: 'SOCCER',
        title: 'כדורגל תל אביב',
        city: 'תל אביב-יפו',
        start: parseJerusalemTimeToUTC(jerusalemDatePlus(2), '18:00'),
        confirmedUserIds: [o],
      },
      {
        key: 'haifaBasketball',
        id: 'seed_game_haifa_basketball',
        fieldId: 'seed_field_haifa',
        sport: 'BASKETBALL',
        title: 'כדורסל חיפה',
        city: 'חיפה',
        start: parseJerusalemTimeToUTC(jerusalemDatePlus(3), '20:00'),
        confirmedUserIds: [o],
      },
      {
        key: 'jerusalemSoccer',
        id: 'seed_game_jerusalem_soccer',
        fieldId: 'seed_field_jerusalem',
        sport: 'SOCCER',
        title: 'כדורגל ירושלים',
        city: 'ירושלים',
        start: parseJerusalemTimeToUTC(jerusalemDatePlus(4), '19:30'),
        confirmedUserIds: [o],
      },
      {
        key: 'beerShevaBasketball',
        id: 'seed_game_beer_sheva_basketball',
        fieldId: 'seed_field_beer_sheva',
        sport: 'BASKETBALL',
        title: 'כדורסל באר שבע',
        city: 'באר שבע',
        start: parseJerusalemTimeToUTC(jerusalemDatePlus(5), '21:00'),
        confirmedUserIds: [o],
      },
      {
        key: 'friendsRequest',
        id: 'seed_game_friends_request',
        fieldId: 'seed_field_tlv',
        sport: 'SOCCER',
        title: 'כדורגל לחברים',
        city: 'תל אביב-יפו',
        start: parseJerusalemTimeToUTC(jerusalemDatePlus(2), '21:00'),
        confirmedUserIds: [o],
        isFriendsOnly: true,
        friendsOnlyLinkPolicy: 'REQUEST_TO_JOIN',
      },
      {
        key: 'friendsBlocked',
        id: 'seed_game_friends_blocked',
        fieldId: 'seed_field_jerusalem',
        sport: 'SOCCER',
        title: 'כדורגל חברים חסום',
        city: 'ירושלים',
        start: parseJerusalemTimeToUTC(jerusalemDatePlus(4), '21:00'),
        confirmedUserIds: [o],
        isFriendsOnly: true,
        friendsOnlyLinkPolicy: 'BLOCKED',
      },
      {
        key: 'approval',
        id: 'seed_game_approval',
        fieldId: 'seed_field_tlv',
        sport: 'SOCCER',
        title: 'כדורגל באישור',
        city: 'תל אביב-יפו',
        start: parseJerusalemTimeToUTC(jerusalemDatePlus(3), '18:30'),
        confirmedUserIds: [o],
        joinPolicy: 'REQUIRES_APPROVAL',
        pendingUserId: b,
      },
      {
        key: 'groupChat',
        id: 'seed_game_group',
        fieldId: 'seed_field_haifa',
        sport: 'BASKETBALL',
        title: 'כדורסל קבוצתי',
        city: 'חיפה',
        start: parseJerusalemTimeToUTC(jerusalemDatePlus(6), '19:00'),
        confirmedUserIds: [o, a, c],
      },
      {
        key: 'weeklyOccurrence',
        id: 'seed_game_series_next',
        fieldId: 'seed_field_tlv',
        sport: 'SOCCER',
        title: weeklyTitle,
        city: 'תל אביב-יפו',
        start: weeklyStart,
        confirmedUserIds: [o],
        seriesId: 'seed_series_weekly',
      },
    ];

    for (const game of games) {
      assertNoSeriesWord(game.title);
      await createGame(prisma, { ...game, organizerId: o });
    }

    await prisma.message.create({
      data: {
        chatRoomId: 'seed_game_group',
        userId: a,
        text: 'נתראה במשחק הקבוצה',
        status: 'sent',
      },
    });

    await prisma.chatRoom.create({
      data: {
        id: 'seed_chat_a_c',
        type: 'PRIVATE',
        participants: { create: [{ userId: a }, { userId: c }] },
        messages: {
          create: [{ userId: a, text: 'היי מאיה, נתראה במגרש?', status: 'sent' }],
        },
      },
    });

    const users = {};
    for (const account of ACCOUNTS) {
      users[account.key] = {
        key: account.key,
        id: ids[account.key],
        email: account.email,
        name: fullName(account),
        role: account.role,
        birthDate: account.birthDate,
        code: VERIFICATION_CODE,
      };
    }

    const fixture = {
      version: 1,
      verificationCode: VERIFICATION_CODE,
      users,
      friends: [{ a: 'adultA', b: 'adultB' }],
      fields: Object.fromEntries(FIELDS.map((field) => [field.id, {
        id: field.id,
        name: field.name,
        city: field.city,
      }])),
      games: Object.fromEntries(games.map((game) => [game.key, {
        id: game.id,
        title: game.title,
        city: game.city,
        sport: game.sport,
        friendsOnlyLinkPolicy: game.friendsOnlyLinkPolicy || null,
        joinPolicy: game.joinPolicy || 'INSTANT',
        isFriendsOnly: !!game.isFriendsOnly,
      }])),
      series: {
        weekly: { id: 'seed_series_weekly', title: weeklyTitle },
        blocked: { id: 'seed_series_blocked', title: blockedSeriesTitle },
      },
      chats: {
        adultMinor: { id: 'seed_chat_a_c', between: ['adultA', 'minorC'] },
        group: { id: 'seed_game_group', between: ['organizerO', 'adultA', 'minorC'] },
      },
    };

    fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
    fs.writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
    console.log(`[seed:dev] wrote ${FIXTURE_PATH}`);
    console.log('[seed:dev] users:', ACCOUNTS.map((account) => `${account.key} ${account.email}`).join(', '));
    console.log(`[seed:dev] sign-in code ${VERIFICATION_CODE}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = { ACCOUNTS, VERIFICATION_CODE };
