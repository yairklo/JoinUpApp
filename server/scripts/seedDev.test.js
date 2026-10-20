const fs = require('fs');
const os = require('os');
const path = require('path');
const { getAgeInJerusalem } = require('../shared/ageGate');
const {
  ACCOUNTS,
  ADULT_MINOR_CHAT_ID,
  ADULT_MINOR_CHAT_PURPOSE,
  FIELD_IDS,
  SERIES_IDS,
  adoptClerkUserId,
  loadExplicitEnv,
  minorBirthDate,
  resetSeed,
} = require('./seedDev');

function recordingPrisma(games) {
  const calls = [];
  const model = (name) => ({
    findMany: async (args) => {
      calls.push({ op: 'findMany', model: name, args });
      return name === 'game' ? games : [];
    },
    deleteMany: async (args) => {
      calls.push({ op: 'deleteMany', model: name, args });
      return { count: 0 };
    },
  });
  const prisma = new Proxy({}, {
    get(_target, prop) {
      return model(String(prop));
    },
  });
  return { prisma, calls };
}

describe('dev seed dataset', () => {
  test('minor birth date stays 14 on the Jerusalem calendar, including past 2030', () => {
    const minor = ACCOUNTS.find((account) => account.key === 'minorC');
    expect(minor.birthDate).toBe(minorBirthDate(14));
    expect(minor.birthDate).not.toBe('2012-06-01');
    expect(getAgeInJerusalem(new Date(`${minor.birthDate}T00:00:00.000Z`))).toBe(14);

    const june2030 = new Date('2030-06-15T20:00:00Z');
    const juneBirth = minorBirthDate(14, june2030);
    expect(juneBirth).toBe('2016-06-15');
    expect(getAgeInJerusalem(new Date(`${juneBirth}T00:00:00.000Z`), june2030)).toBe(14);

    const newYear = new Date('2030-01-15T22:30:00Z');
    expect(minorBirthDate(14, newYear)).toBe('2016-01-16');
    expect(getAgeInJerusalem(new Date('2016-01-16T00:00:00.000Z'), newYear)).toBe(14);

    const leapDay = new Date('2032-02-29T12:00:00Z');
    expect(minorBirthDate(14, leapDay)).toBe('2018-02-28');
    expect(getAgeInJerusalem(new Date('2018-02-28T00:00:00.000Z'), leapDay)).toBe(14);
  });

  test('documents that the adult-minor chat is not a friendship', () => {
    expect(ADULT_MINOR_CHAT_ID).toBe('seed_chat_a_c');
    expect(ADULT_MINOR_CHAT_PURPOSE).toMatch(/not minorC's friend/);
    expect(ADULT_MINOR_CHAT_PURPOSE).toMatch(/profanity filter/);
    expect(ADULT_MINOR_CHAT_PURPOSE).not.toMatch(/סדרה/);
  });

  test('resetSeed deletes generated games on seed fields and series, plus favorite fields', async () => {
    const generatedId = 'clgeneratedweeklygame';
    const { prisma, calls } = recordingPrisma([
      { id: generatedId, managerPickChatId: 'clmanagerpick' },
      { id: 'seed_game_tlv_soccer', managerPickChatId: null },
    ]);
    await resetSeed(prisma, ['user_organizer']);

    const gameQuery = calls.find((call) => call.op === 'findMany' && call.model === 'game');
    expect(gameQuery.args.where.OR).toEqual(expect.arrayContaining([
      { fieldId: { in: FIELD_IDS } },
      { seriesId: { in: SERIES_IDS } },
    ]));

    const deletedGames = calls.find((call) => call.op === 'deleteMany' && call.model === 'game');
    expect(deletedGames.args.where.id.in).toEqual(expect.arrayContaining([generatedId, 'seed_game_tlv_soccer']));

    for (const model of ['userRating', 'playerTrade', 'participation', 'gameRole', 'team']) {
      const call = calls.find((entry) => entry.op === 'deleteMany' && entry.model === model);
      expect(call.args.where.gameId.in).toEqual(expect.arrayContaining([generatedId]));
    }

    const chats = calls.find((call) => call.op === 'deleteMany' && call.model === 'chatRoom');
    expect(chats.args.where.id.in).toEqual(expect.arrayContaining([
      generatedId,
      'clmanagerpick',
      ADULT_MINOR_CHAT_ID,
    ]));

    const favorites = calls.find((call) => call.op === 'deleteMany' && call.model === 'favoriteField');
    expect(favorites.args.where.fieldId.in).toEqual(FIELD_IDS);
    const fields = calls.find((call) => call.op === 'deleteMany' && call.model === 'field');
    expect(calls.indexOf(favorites)).toBeLessThan(calls.indexOf(fields));
    expect(calls.indexOf(deletedGames)).toBeLessThan(calls.indexOf(fields));
  });

  test('re-points a stale clerk test user and deletes one only when the new id exists', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const users = [{ id: 'user_old', email: 'adult-a+clerk_test@example.com' }];
    const ops = [];
    const prisma = {
      user: {
        findFirst: async ({ where }) => users.find((user) => user.email.toLowerCase() === where.email.equals.toLowerCase()) || null,
        findUnique: async ({ where }) => users.find((user) => user.id === where.id) || null,
        delete: async ({ where }) => {
          ops.push(['delete', where.id]);
          const index = users.findIndex((user) => user.id === where.id);
          if (index >= 0) users.splice(index, 1);
        },
      },
      $executeRawUnsafe: async (sql, newId, oldId) => {
        ops.push(['repoint', sql, newId, oldId]);
        const row = users.find((user) => user.id === oldId);
        if (row) row.id = newId;
      },
      game: { updateMany: async (args) => ops.push(['game', args]) },
      gameSeries: { updateMany: async (args) => ops.push(['series', args]) },
      favoriteField: { deleteMany: async () => ops.push(['favorite']) },
      friendship: { deleteMany: async () => ops.push(['friendship']) },
      friendRequest: { deleteMany: async () => ops.push(['friendRequest']) },
      userSport: { deleteMany: async () => ops.push(['sport']) },
      userPosition: { deleteMany: async () => ops.push(['position']) },
      gameRole: { deleteMany: async () => ops.push(['role']) },
      seriesParticipant: { deleteMany: async () => ops.push(['subscriber']) },
    };

    await expect(adoptClerkUserId(prisma, 'adult-a+clerk_test@example.com', 'user_old')).resolves.toEqual({ action: 'none' });
    await expect(adoptClerkUserId(prisma, 'adult-a+clerk_test@example.com', 'user_new')).resolves.toEqual({
      action: 'repoint',
      from: 'user_old',
      to: 'user_new',
    });
    expect(users[0].id).toBe('user_new');

    users.push({ id: 'user_stale', email: 'minor-c+clerk_test@example.com' });
    await expect(adoptClerkUserId(prisma, 'minor-c+clerk_test@example.com', 'user_new')).resolves.toEqual({
      action: 'delete',
      id: 'user_stale',
    });
    expect(ops).toEqual(expect.arrayContaining([
      ['repoint', expect.stringContaining('UPDATE "User"'), 'user_new', 'user_old'],
      ['delete', 'user_stale'],
    ]));
    await expect(adoptClerkUserId(prisma, 'real@example.com', 'user_x')).rejects.toThrow(/clerk_test/);
    log.mockRestore();
  });

  test('loads environment variables only from an explicit --env-file', () => {
    const file = path.join(os.tmpdir(), `joinup-seed-env-${process.pid}.env`);
    fs.writeFileSync(file, 'SEED_TEST_FROM_FILE=from-file\n');
    const previous = process.env.SEED_TEST_FROM_FILE;
    delete process.env.SEED_TEST_FROM_FILE;
    try {
      loadExplicitEnv(['node', 'seedDev.js']);
      expect(process.env.SEED_TEST_FROM_FILE).toBeUndefined();
      loadExplicitEnv(['node', 'seedDev.js', '--env-file', file]);
      expect(process.env.SEED_TEST_FROM_FILE).toBe('from-file');
      process.env.SEED_TEST_FROM_FILE = 'from-shell';
      loadExplicitEnv(['node', 'seedDev.js', '--env-file', file]);
      expect(process.env.SEED_TEST_FROM_FILE).toBe('from-shell');
      expect(() => loadExplicitEnv(['node', 'seedDev.js', '--env-file'])).toThrow(/--env-file requires a path/);
    } finally {
      if (previous === undefined) delete process.env.SEED_TEST_FROM_FILE;
      else process.env.SEED_TEST_FROM_FILE = previous;
      fs.unlinkSync(file);
    }

    const source = fs.readFileSync(path.join(__dirname, 'seedDev.js'), 'utf8');
    expect(source).not.toMatch(/dotenv'\.config\(\{ path: path\.join\(__dirname/);
    const prismaSource = fs.readFileSync(path.join(__dirname, '../lib/prisma.js'), 'utf8');
    expect(prismaSource).toMatch(/JOINUP_SKIP_DOTENV/);
  });
});
