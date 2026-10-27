// Per-user game reminders ("your game starts in N minutes"). Runs from the leader-locked jobs
// runtime (services/jobsRuntime.js) every 5 minutes. Each participant picks their own lead time
// (UserNotificationSettings.gameReminderLeadMinutes); a (user, game, game start) row in
// GameReminderSent is the dedupe key, so a second sweep, a second sweeper or a changed setting
// never double-sends, and an edited start time (a new key) is reminded again.
const { formatJerusalemTime } = require('../shared/timezone');
const { GAME_REMINDER_LEAD_DEFAULT, GAME_REMINDER_LEAD_MAX } = require('../shared/notificationPrefs');

const MINUTE_MS = 60 * 1000;
const TZ = 'Asia/Jerusalem';
const PAGE_SIZE = 200;
const MAX_PAGES = 50; // safety cap: 10k games per sweep
const FAR_MINUTES = 20 * 60; // beyond this, say "tomorrow at HH:MM" instead of a duration

function dayKey(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/**
 * Whether a participant should be reminded about a game starting at `start` right now.
 * Pure: no I/O, so the rules are testable for any lead value.
 *  - now must be inside [start - lead, start)
 *  - someone who joined at/after their reminder moment just saw the time: no reminder
 *  - same if they changed the lead after the moment had already passed (gameReminderLeadUpdatedAt, which
 *    only moves when the lead value itself changes, so other settings edits never suppress a reminder)
 */
function isReminderDue({ now, start, leadMinutes, joinedAt, leadUpdatedAt }) {
  const nowMs = new Date(now).getTime();
  const startMs = new Date(start).getTime();
  const momentMs = startMs - leadMinutes * MINUTE_MS;
  if (!(nowMs >= momentMs && nowMs < startMs)) return false;
  if (joinedAt && new Date(joinedAt).getTime() >= momentMs) return false;
  if (leadUpdatedAt && new Date(leadUpdatedAt).getTime() > momentMs) return false;
  return true;
}

/** Real time left, rounded to 5 minutes (exact under 10). */
function describeTimeLeft({ now, start, lang = 'he' }) {
  const startDate = new Date(start);
  const leftMin = Math.max(1, Math.round((startDate.getTime() - new Date(now).getTime()) / MINUTE_MS));
  const time = formatJerusalemTime(startDate);
  const he = lang !== 'en';

  if (leftMin > FAR_MINUTES) {
    const daysAhead = Math.round(
      (new Date(`${dayKey(startDate)}T00:00:00Z`) - new Date(`${dayKey(new Date(now))}T00:00:00Z`)) / 86400000,
    );
    if (daysAhead <= 0) return he ? `היום ב-${time}` : `today at ${time}`;
    if (daysAhead === 1) return he ? `מחר ב-${time}` : `tomorrow at ${time}`;
    const day = new Intl.DateTimeFormat(he ? 'he-IL' : 'en-GB', { timeZone: TZ, weekday: 'long' }).format(startDate);
    return he ? `ביום ${day} ב-${time}` : `on ${day} at ${time}`;
  }

  const total = leftMin < 10 ? leftMin : Math.round(leftMin / 5) * 5;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (he) {
    const hours = h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : `${h} שעות`;
    const mins = m === 1 ? 'דקה' : `${m} דקות`;
    if (h === 0) return `בעוד ${mins}`;
    return m === 0 ? `בעוד ${hours}` : `בעוד ${hours} ו-${mins}`;
  }
  const hours = `${h} hour${h === 1 ? '' : 's'}`;
  const mins = `${m} minute${m === 1 ? '' : 's'}`;
  if (h === 0) return `in ${mins}`;
  return m === 0 ? `in ${hours}` : `in ${hours} ${mins}`;
}

function buildReminderMessage({ now, start, fieldName, lang = 'he' }) {
  const when = describeTimeLeft({ now, start, lang });
  const absolute = lang === 'en' ? / at \d/.test(when) : / ב-\d/.test(when);
  const time = formatJerusalemTime(start);
  if (lang === 'en') {
    return {
      title: 'Game coming up!',
      body: `Your game at ${fieldName} starts ${when}${absolute ? '' : ` (${time})`}`,
    };
  }
  return {
    title: 'משחק מתקרב!',
    body: `המשחק שלך ב-${fieldName} מתחיל ${when}${absolute ? '' : ` (${time})`}`,
  };
}

const SENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** Furthest ahead any reminder can be due: the largest lead in use (min the default), capped at the max. */
async function reminderHorizonMs(prisma) {
  let maxLead = GAME_REMINDER_LEAD_MAX;
  try {
    const agg = await prisma.userNotificationSettings.aggregate({ _max: { gameReminderLeadMinutes: true } });
    const used = agg && agg._max && agg._max.gameReminderLeadMinutes;
    maxLead = Math.min(GAME_REMINDER_LEAD_MAX, Math.max(GAME_REMINDER_LEAD_DEFAULT, used || 0));
  } catch (error) {
    console.error('[GAME-REMINDERS] Could not read max lead, using the full horizon:', error);
  }
  return maxLead * MINUTE_MS;
}

// Keyset paging on (start, id): unlike a cursor row it keeps working when the last game of a page
// is deleted, cancelled or rescheduled while the sweep is running.
function fetchPage(prisma, now, horizonMs, after) {
  const window = { gt: now, lte: new Date(now.getTime() + horizonMs) };
  return prisma.game.findMany({
    where: {
      status: 'OPEN',
      ...(after
        ? {
          OR: [
            { start: { gt: after.start, lte: window.lte } },
            { start: after.start, id: { gt: after.id } },
          ],
        }
        : { start: window }),
    },
    select: {
      id: true,
      start: true,
      field: { select: { name: true } },
      participants: {
        where: { status: 'CONFIRMED' },
        select: {
          userId: true,
          createdAt: true,
          user: {
            select: {
              notificationSettings: {
                select: { gameReminderLeadMinutes: true, gameRemindersEnabled: true, gameRemindersInApp: true, gameReminderLeadUpdatedAt: true },
              },
            },
          },
        },
      },
    },
    orderBy: [{ start: 'asc' }, { id: 'asc' }],
    take: PAGE_SIZE,
  });
}

async function remindPage({ games, prisma, notificationService, io, now, shouldContinue }) {
  let sent = 0;
  // One read for the whole page instead of an insert attempt per due participant per sweep.
  const already = new Set();
  if (games.length) {
    const rows = await prisma.gameReminderSent.findMany({
      where: { gameId: { in: games.map((g) => g.id) } },
      select: { userId: true, gameId: true, gameStart: true },
    });
    for (const r of rows) already.add(`${r.userId}|${r.gameId}|${new Date(r.gameStart).getTime()}`);
  }
  for (const game of games) {
    if (!shouldContinue()) break;
    for (const p of game.participants) {
      if (!shouldContinue()) break;
      if (already.has(`${p.userId}|${game.id}|${new Date(game.start).getTime()}`)) continue;
      const s = p.user && p.user.notificationSettings;
      if (s && s.gameRemindersEnabled === false && s.gameRemindersInApp === false) continue;
      const due = isReminderDue({
        now,
        start: game.start,
        leadMinutes: (s && s.gameReminderLeadMinutes) || GAME_REMINDER_LEAD_DEFAULT,
        joinedAt: p.createdAt,
        leadUpdatedAt: s && s.gameReminderLeadUpdatedAt,
      });
      if (!due) continue;

      // Claim before sending (still the race guard between sweepers): at-most-once per (user, game, start).
      const claim = await prisma.gameReminderSent.createMany({
        data: [{ userId: p.userId, gameId: game.id, gameStart: game.start }],
        skipDuplicates: true,
      });
      if (claim.count !== 1) continue;

      const { title, body } = buildReminderMessage({ now, start: game.start, fieldName: (game.field && game.field.name) || '' });
      try {
        await notificationService.sendNotification(
          p.userId, 'GAME_REMINDER', title, body,
          { gameId: game.id, link: `/games/${game.id}`, type: 'GAME_REMINDER' }, io,
        );
        sent += 1;
      } catch (error) {
        console.error(`[GAME-REMINDERS] Failed to send reminder to ${p.userId}:`, error);
      }
    }
  }
  return sent;
}

/**
 * Pages through every OPEN game starting within the horizon (keyset on start,id) so a busy window can
 * never silently skip games. A safety cap bounds a runaway sweep and logs a warning. Old dedupe rows
 * (games that already started a week ago) are pruned at the end.
 */
async function runGameReminderSweep({ prisma, notificationService, io = null, now = new Date(), shouldContinue = () => true }) {
  const horizonMs = await reminderHorizonMs(prisma);
  let sent = 0;
  let after = null;
  for (let page = 0; ; page += 1) {
    if (!shouldContinue()) return { sent };
    if (page >= MAX_PAGES) {
      console.warn(`[GAME-REMINDERS] Page cap (${MAX_PAGES} x ${PAGE_SIZE} games) hit; remaining games wait for the next sweep`);
      break;
    }
    const games = await fetchPage(prisma, now, horizonMs, after);
    sent += await remindPage({ games, prisma, notificationService, io, now, shouldContinue });
    if (games.length < PAGE_SIZE) break;
    const last = games[games.length - 1];
    after = { start: last.start, id: last.id };
  }
  try {
    await prisma.gameReminderSent.deleteMany({ where: { gameStart: { lt: new Date(now.getTime() - SENT_RETENTION_MS) } } });
  } catch (error) {
    console.error('[GAME-REMINDERS] Failed to prune old dedupe rows:', error);
  }
  return { sent };
}

module.exports = { PAGE_SIZE, MAX_PAGES, runGameReminderSweep, isReminderDue, describeTimeLeft, buildReminderMessage };
