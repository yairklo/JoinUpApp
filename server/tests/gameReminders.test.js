const {
  runGameReminderSweep,
  isReminderDue,
  describeTimeLeft,
  buildReminderMessage,
} = require('../services/gameReminders');

const MIN = 60000;
const START = new Date('2026-11-10T17:00:00Z'); // 19:00 Asia/Jerusalem (winter, UTC+2)
const at = (minsBeforeStart) => new Date(START.getTime() - minsBeforeStart * MIN);
const long = new Date('2026-01-01T00:00:00Z');

describe('isReminderDue', () => {
  test.each([5, 45, 135, 2880])('lead %i is due only inside [start-lead, start)', (lead) => {
    const base = { start: START, leadMinutes: lead, joinedAt: long };
    expect(isReminderDue({ ...base, now: at(lead + 1) })).toBe(false);
    expect(isReminderDue({ ...base, now: at(lead) })).toBe(true);
    expect(isReminderDue({ ...base, now: at(1) })).toBe(true);
    expect(isReminderDue({ ...base, now: START })).toBe(false); // started
    expect(isReminderDue({ ...base, now: at(-10) })).toBe(false);
  });

  test('participant who joined at/after their reminder moment gets none', () => {
    const base = { start: START, leadMinutes: 60, now: at(50) };
    expect(isReminderDue({ ...base, joinedAt: at(60) })).toBe(false);
    expect(isReminderDue({ ...base, joinedAt: at(55) })).toBe(false);
    expect(isReminderDue({ ...base, joinedAt: at(61) })).toBe(true);
  });

  test('lengthening the lead after the moment passed gets none; shortening still works', () => {
    // lead was 60, user saved 120 at T-90 -> moment (T-120) already passed
    expect(isReminderDue({ start: START, leadMinutes: 120, now: at(85), joinedAt: long, leadUpdatedAt: at(90) })).toBe(false);
    // user saved 30 at T-90 -> moment T-30 is still ahead
    expect(isReminderDue({ start: START, leadMinutes: 30, now: at(28), joinedAt: long, leadUpdatedAt: at(90) })).toBe(true);
  });
});

describe('describeTimeLeft / buildReminderMessage', () => {
  test('hebrew durations', () => {
    expect(describeTimeLeft({ now: at(45), start: START })).toBe('בעוד 45 דקות');
    expect(describeTimeLeft({ now: at(60), start: START })).toBe('בעוד שעה');
    expect(describeTimeLeft({ now: at(120), start: START })).toBe('בעוד שעתיים');
    expect(describeTimeLeft({ now: at(135), start: START })).toBe('בעוד שעתיים ו-15 דקות');
    expect(describeTimeLeft({ now: at(180), start: START })).toBe('בעוד 3 שעות');
    expect(describeTimeLeft({ now: at(5), start: START })).toBe('בעוד 5 דקות');
  });
  test('english durations', () => {
    expect(describeTimeLeft({ now: at(45), start: START, lang: 'en' })).toBe('in 45 minutes');
    expect(describeTimeLeft({ now: at(120), start: START, lang: 'en' })).toBe('in 2 hours');
  });
  test('far away uses tomorrow + Jerusalem time', () => {
    const now = new Date(START.getTime() - 24 * 60 * MIN); // previous day
    expect(describeTimeLeft({ now, start: START })).toBe('מחר ב-19:00');
    expect(describeTimeLeft({ now, start: START, lang: 'en' })).toBe('tomorrow at 19:00');
  });
  test('message carries the real time left', () => {
    const m = buildReminderMessage({ now: at(45), start: START, fieldName: 'מגרש' });
    expect(m.body).toBe('המשחק שלך ב-מגרש מתחיל בעוד 45 דקות (19:00)');
  });
});

// Minimal in-memory prisma double for the sweep
function makePrisma(game) {
  const sent = new Set();
  return {
    sent,
    game: { findMany: jest.fn(async () => (game.status === 'OPEN' && game.start > game._now ? [game] : [])) },
    gameReminderSent: {
      createMany: jest.fn(async ({ data }) => {
        let count = 0;
        for (const r of data) {
          const k = `${r.userId}|${r.gameId}|${new Date(r.gameStart).toISOString()}`;
          if (!sent.has(k)) { sent.add(k); count += 1; }
        }
        return { count };
      }),
    },
  };
}

function participant(userId, { joined = long, lead = 60, updatedAt = long, leadUpdatedAt = null, enabled = true, inApp = true } = {}) {
  return {
    userId,
    createdAt: joined,
    user: { notificationSettings: { gameReminderLeadMinutes: lead, gameRemindersEnabled: enabled, gameRemindersInApp: inApp, updatedAt, gameReminderLeadUpdatedAt: leadUpdatedAt } },
  };
}

describe('runGameReminderSweep', () => {
  const mk = (participants, start = START) => ({ id: 'g1', status: 'OPEN', start, field: { name: 'F' }, participants, _now: null });
  const run = (prisma, game, now, notificationService) => {
    game._now = now;
    return runGameReminderSweep({ prisma, notificationService, now });
  };

  test('sends once, second sweep sends nothing', async () => {
    const game = mk([participant('u1', { lead: 45 }), participant('u2', { lead: 135 })]);
    const prisma = makePrisma(game);
    const ns = { sendNotification: jest.fn().mockResolvedValue({}) };

    expect((await run(prisma, game, at(130), ns)).sent).toBe(1); // only u2 (135)
    expect(ns.sendNotification.mock.calls[0][0]).toBe('u2');
    expect((await run(prisma, game, at(44), ns)).sent).toBe(1); // now u1
    expect(ns.sendNotification.mock.calls[1][0]).toBe('u1');
    expect((await run(prisma, game, at(40), ns)).sent).toBe(0);
    expect(ns.sendNotification).toHaveBeenCalledTimes(2);
    expect(ns.sendNotification.mock.calls[1][2]).toBe('משחק מתקרב!');
    expect(ns.sendNotification.mock.calls[1][3]).toContain('בעוד 45 דקות');
  });

  test('edited game time sends again for the new start', async () => {
    const game = mk([participant('u1')]);
    const prisma = makePrisma(game);
    const ns = { sendNotification: jest.fn().mockResolvedValue({}) };
    await run(prisma, game, at(50), ns);
    const newStart = new Date(START.getTime() + 3 * 60 * MIN);
    game.start = newStart;
    const r = await run(prisma, game, new Date(newStart.getTime() - 50 * MIN), ns);
    expect(r.sent).toBe(1);
    expect(ns.sendNotification).toHaveBeenCalledTimes(2);
  });

  test('changing the setting after a reminder does not resend', async () => {
    const game = mk([participant('u1', { lead: 60 })]);
    const prisma = makePrisma(game);
    const ns = { sendNotification: jest.fn().mockResolvedValue({}) };
    await run(prisma, game, at(58), ns);
    game.participants = [participant('u1', { lead: 120, leadUpdatedAt: at(50) })];
    await run(prisma, game, at(40), ns);
    game.participants = [participant('u1', { lead: 30, leadUpdatedAt: at(50) })];
    await run(prisma, game, at(25), ns);
    expect(ns.sendNotification).toHaveBeenCalledTimes(1);
  });

  test('joined after their reminder moment -> none; started game skipped; both toggles off skipped', async () => {
    const game = mk([
      participant('late', { joined: at(30) }),
      participant('off', { enabled: false, inApp: false }),
      participant('ok'),
    ]);
    const prisma = makePrisma(game);
    const ns = { sendNotification: jest.fn().mockResolvedValue({}) };
    const r = await run(prisma, game, at(40), ns);
    expect(r.sent).toBe(1);
    expect(ns.sendNotification.mock.calls[0][0]).toBe('ok');

    const started = mk([participant('ok')]);
    const p2 = makePrisma(started);
    expect((await run(p2, started, new Date(START.getTime() + MIN), ns)).sent).toBe(0);
  });

  test('editing other settings (quiet hours) after the reminder moment still sends', async () => {
    // row updatedAt moved after the moment (T-60) but the lead value was never changed
    const game = mk([participant('u1', { lead: 60, updatedAt: at(50), leadUpdatedAt: null })]);
    const prisma = makePrisma(game);
    const ns = { sendNotification: jest.fn().mockResolvedValue({}) };
    expect((await run(prisma, game, at(40), ns)).sent).toBe(1);
  });

  test('survives a send failure for one recipient', async () => {
    const game = mk([participant('a'), participant('b')]);
    const prisma = makePrisma(game);
    game._now = at(30);
    const ns = { sendNotification: jest.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue({}) };
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const r = await runGameReminderSweep({ prisma, notificationService: ns, now: at(30) });
    expect(r.sent).toBe(1);
    expect(ns.sendNotification).toHaveBeenCalledTimes(2);
  });
});
