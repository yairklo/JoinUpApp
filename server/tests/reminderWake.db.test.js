// The planner's SQL against a real Postgres, paired with the REAL sweeps: for every scenario where
// the planner returns a moment, the sweep run at that moment must actually send something; where
// the sweep would skip, the planner must return null. A mismatch is a hot loop (wake, send
// nothing, plan the same moment again) or a missed reminder.
//
// All timestamps use a fixed far-future clock so rows left by other suites (real "now" is years
// earlier) can never be picked up as "upcoming".
jest.mock('../utils/tournamentGate', () => ({ filterViewableUserIds: async (ids) => ids }));

const { prisma } = require('../lib/prisma');
const { planNextReminderWake, SLACK_MS } = require('../services/reminderWake');
const { runGameReminderSweep } = require('../services/gameReminders');
const { runReminderSweep } = require('../services/tournamentReminders');

jest.setTimeout(60000);

const MIN = 60 * 1000;
const NOW = new Date('2031-03-01T12:00:00Z');
const at = (mins) => new Date(NOW.getTime() + mins * MIN);
const U = (n) => `rw_u${n}`;
const USERS = [1, 2, 3].map(U);

let field;
const gameIds = [];
const tournamentIds = [];
const plan = (now = NOW) => planNextReminderWake({ prisma, now });

function fakeNotifier() {
  return {
    sendNotification: jest.fn().mockResolvedValue(undefined),
    sendNotificationToMany: jest.fn().mockResolvedValue(undefined),
  };
}

/** Creates one OPEN game starting `startMin` minutes after NOW with the given participants. */
async function makeGame({ startMin, status = 'OPEN', parts = [{ userId: U(1) }] }) {
  const game = await prisma.game.create({
    data: {
      fieldId: field.id, organizerId: U(3), start: at(startMin), maxPlayers: 10, status,
      participants: {
        create: parts.map((p) => ({ status: 'CONFIRMED', createdAt: new Date('2031-01-01T00:00:00Z'), ...p })),
      },
    },
  });
  gameIds.push(game.id);
  return game;
}
const setPrefs = (n, data) => prisma.userNotificationSettings.upsert({
  where: { userId: U(n) }, create: { userId: U(n), ...data }, update: data,
});

async function clean() {
  for (const id of tournamentIds.splice(0)) await prisma.tournament.delete({ where: { id } }).catch(() => {});
  await prisma.gameReminderSent.deleteMany({ where: { gameId: { in: gameIds } } });
  await prisma.participation.deleteMany({ where: { gameId: { in: gameIds } } });
  await prisma.game.deleteMany({ where: { id: { in: gameIds } } });
  gameIds.length = 0;
  await prisma.userNotificationSettings.deleteMany({ where: { userId: { in: USERS } } });
}

beforeAll(async () => {
  // leftovers from an aborted earlier run
  await prisma.tournament.deleteMany({ where: { organizerId: { in: USERS } } });
  const stale = (await prisma.game.findMany({ where: { organizerId: { in: USERS } }, select: { id: true } })).map((g) => g.id);
  gameIds.push(...stale);
  await clean();
  for (const id of USERS) await prisma.user.upsert({ where: { id }, update: {}, create: { id, name: id } });
  field = await prisma.field.create({ data: { name: 'rw field', location: 'x', price: 0, available: false, type: 'OPEN' } });
});
afterEach(clean);
afterAll(async () => {
  try {
    await clean();
    await prisma.field.delete({ where: { id: field.id } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: USERS } } });
  } finally {
    await prisma.$disconnect();
  }
});

/** The sweep, run when the planner said to wake, must send >= 1 reminder (no hot loop). */
async function expectSweepSendsAt(momentMs) {
  const notifier = fakeNotifier();
  const r = await runGameReminderSweep({
    prisma, notificationService: notifier, now: new Date(momentMs + 1000),
  });
  expect(r.sent).toBeGreaterThanOrEqual(1);
}

describe('planNextReminderWake - games (exact per-user moment)', () => {
  test('nothing upcoming -> null', async () => {
    expect(await plan()).toBeNull();
  });

  test('default lead (60) -> start - 60min, and the sweep then sends', async () => {
    await makeGame({ startMin: 300 });
    const w = await plan();
    expect(w).toBe(at(240).getTime() + SLACK_MS);
    await expectSweepSendsAt(w);
  });

  test('per-user lead is honoured (no global 48h horizon): lead 180 -> start - 3h', async () => {
    await makeGame({ startMin: 600 });
    await setPrefs(1, { gameReminderLeadMinutes: 180 });
    const w = await plan();
    expect(w).toBe(at(420).getTime() + SLACK_MS);
    await expectSweepSendsAt(w);
  });

  test('earliest moment across participants wins', async () => {
    await makeGame({ startMin: 600, parts: [{ userId: U(1) }, { userId: U(2) }] });
    await setPrefs(1, { gameReminderLeadMinutes: 30 });
    await setPrefs(2, { gameReminderLeadMinutes: 120 });
    expect(await plan()).toBe(at(480).getTime() + SLACK_MS);
  });

  test('a long lead on an unrelated far game does not pull this one earlier', async () => {
    await makeGame({ startMin: 600, parts: [{ userId: U(1) }] });
    await makeGame({ startMin: 60 * 24 * 20, parts: [{ userId: U(2) }] });
    await setPrefs(2, { gameReminderLeadMinutes: 2880 });
    expect(await plan()).toBe(at(540).getTime() + SLACK_MS);
  });

  test('a moment already due is reported as overdue (past), for the scheduler to floor/back off', async () => {
    await makeGame({ startMin: 20 }); // moment = -40min
    const w = await plan();
    expect(w).toBe(at(-40).getTime() + SLACK_MS);
    expect(w).toBeLessThan(NOW.getTime());
    await expectSweepSendsAt(NOW.getTime() - 1000); // and the sweep really does send it
  });

  test('push off but in-app on still counts; both off is never reminded (same rule as remindPage)', async () => {
    await makeGame({ startMin: 300 });
    await setPrefs(1, { gameRemindersEnabled: false, gameRemindersInApp: true });
    const w = await plan();
    expect(w).toBe(at(240).getTime() + SLACK_MS);
    await expectSweepSendsAt(w);
    await setPrefs(1, { gameRemindersEnabled: false, gameRemindersInApp: false });
    expect(await plan()).toBeNull();
    const notifier = fakeNotifier();
    expect((await runGameReminderSweep({ prisma, notificationService: notifier, now: at(245) })).sent).toBe(0);
  });

  test('already-sent reminders are excluded (dedupe key user+game+start)', async () => {
    const g = await makeGame({ startMin: 300 });
    await prisma.gameReminderSent.create({ data: { userId: U(1), gameId: g.id, gameStart: g.start } });
    expect(await plan()).toBeNull();
  });

  test('joined at/after the reminder moment -> isReminderDue is false forever -> excluded', async () => {
    await makeGame({ startMin: 300, parts: [{ userId: U(1), createdAt: at(250) }] }); // moment = +240
    expect(await plan()).toBeNull();
    const notifier = fakeNotifier();
    expect((await runGameReminderSweep({ prisma, notificationService: notifier, now: at(260) })).sent).toBe(0);
  });

  test('lead changed after the moment passed -> excluded; changed before it -> included', async () => {
    await makeGame({ startMin: 300 });
    await setPrefs(1, { gameReminderLeadMinutes: 120, gameReminderLeadUpdatedAt: at(190) }); // moment +180 < updated? no: 190 > 180
    expect(await plan()).toBeNull();
    await setPrefs(1, { gameReminderLeadMinutes: 120, gameReminderLeadUpdatedAt: at(100) }); // before the moment
    const w = await plan();
    expect(w).toBe(at(180).getTime() + SLACK_MS);
    await expectSweepSendsAt(w);
  });

  test('only CONFIRMED participants of OPEN, future games count', async () => {
    await makeGame({ startMin: 300, parts: [{ userId: U(1), status: 'WAITLISTED' }, { userId: U(2), status: 'NOT_SELECTED' }] });
    await makeGame({ startMin: 300, status: 'COMPLETED' });
    await makeGame({ startMin: -30 }); // already started
    expect(await plan()).toBeNull();
  });
});

describe('planNextReminderWake - tournament matches', () => {
  async function makeMatch({ startMin, status = 'IN_PROGRESS', details = null, teams = true }) {
    const t = await prisma.tournament.create({
      data: {
        organizerId: U(3), title: 'RW Cup', sport: 'SOCCER', startsAt: NOW, format: 'LEAGUE', status,
        maxTeams: 8, startersPerTeam: 5, minPlayersPerTeam: 5, maxPlayersPerTeam: 8, rules: {},
      },
    });
    tournamentIds.push(t.id);
    const stage = await prisma.tournamentStage.create({ data: { tournamentId: t.id, order: 0, type: 'LEAGUE', name: 'L', config: {} } });
    const mk = (name, user) => prisma.tournamentTeam.create({
      data: {
        tournamentId: t.id, name, captainId: user, status: 'APPROVED', joinCode: `${t.id.slice(-6)}-${name}`,
        members: { create: [{ tournamentId: t.id, userId: user, role: 'CAPTAIN', status: 'ACCEPTED' }] },
      },
    });
    const home = await mk('A', U(1));
    const away = await mk('B', U(2));
    const m = await prisma.tournamentMatch.create({
      data: {
        tournamentId: t.id, stageId: stage.id, round: 1, number: 1, scheduledAt: at(startMin),
        homeTeamId: teams ? home.id : null, awayTeamId: teams ? away.id : null, details: details || undefined,
      },
    });
    return { t, m };
  }

  test('plans scheduledAt - 1h, and the sweep then reminds', async () => {
    await makeMatch({ startMin: 600 });
    const w = await plan();
    expect(w).toBe(at(540).getTime() + SLACK_MS);
    const notifier = fakeNotifier();
    const r = await runReminderSweep({ prisma, notificationService: notifier, now: new Date(w + 1000) });
    expect(r.reminded).toBe(1);
    // once claimed, the planner no longer asks for it
    expect(await plan()).toBeNull();
  });

  test('excluded: already claimed, not IN_PROGRESS, missing team, past', async () => {
    await makeMatch({ startMin: 600, details: { reminderSentAt: NOW.toISOString() } });
    await makeMatch({ startMin: 600, status: 'DRAFT' });
    await makeMatch({ startMin: 600, teams: false });
    await makeMatch({ startMin: -10 });
    expect(await plan()).toBeNull();
  });

  test('earliest of games and matches', async () => {
    await makeMatch({ startMin: 400 });
    await makeGame({ startMin: 900 });
    expect(await plan()).toBe(at(340).getTime() + SLACK_MS); // match: 400 - 60
  });
});
