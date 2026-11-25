// "When is the next reminder actually due?" — the exact answer, so the DB can idle between
// reminders instead of being polled. Pairs with services/reminderScheduler.js.
//
// The filters MIRROR the sweeps (gameReminders.js remindPage/isReminderDue, tournamentReminders.js)
// so the planner never returns a moment the sweep would then skip: a mismatch there is a hot loop
// (wake, sweep sends nothing, plan the same moment again). Each rule below names its twin.
//
// Cost: one query per kind, driven by Game(status,start) / Participation(gameId,status) and
// TournamentMatch(tournamentId,scheduledAt); no table scans of history.
const { LEAD_MS: TOURNAMENT_LEAD_MS } = require('./tournamentReminders');
const { GAME_REMINDER_LEAD_DEFAULT } = require('../shared/notificationPrefs');

// Timers can fire ~1ms before their target and clocks can step; a wake landing a hair BEFORE the
// moment would sweep nothing and cost a whole re-plan. Aim just after it.
const SLACK_MS = 1000;

/**
 * Earliest moment any CONFIRMED participant of an OPEN, future game should be reminded.
 * Per participant: moment = start - lead (lead from their settings, default when absent/0).
 *  - gameRemindersEnabled=false AND gameRemindersInApp=false -> never reminded (remindPage skip)
 *  - GameReminderSent row for (user, game, start)            -> already reminded (dedupe key)
 *  - joined at/after the moment, or lead changed after it    -> isReminderDue is false forever
 */
async function nextGameMoment(prisma, now) {
  const rows = await prisma.$queryRaw`
    SELECT MIN(x."moment") AS "moment" FROM (
      SELECT
        g."start" - (COALESCE(NULLIF(s."gameReminderLeadMinutes", 0), ${GAME_REMINDER_LEAD_DEFAULT}) * INTERVAL '1 minute') AS "moment",
        p."createdAt" AS "joinedAt",
        s."gameReminderLeadUpdatedAt" AS "leadUpdatedAt"
      FROM "Game" g
      JOIN "Participation" p ON p."gameId" = g."id" AND p."status" = 'CONFIRMED'
      LEFT JOIN "UserNotificationSettings" s ON s."userId" = p."userId"
      WHERE g."status" = 'OPEN'
        AND g."start" > ${now}
        AND NOT (COALESCE(s."gameRemindersEnabled", true) = false AND COALESCE(s."gameRemindersInApp", true) = false)
        AND NOT EXISTS (
          SELECT 1 FROM "GameReminderSent" r
          WHERE r."userId" = p."userId" AND r."gameId" = g."id" AND r."gameStart" = g."start"
        )
    ) x
    WHERE x."joinedAt" < x."moment"
      AND (x."leadUpdatedAt" IS NULL OR x."leadUpdatedAt" <= x."moment")`;
  const m = rows && rows[0] && rows[0].moment;
  return m ? new Date(m).getTime() : null;
}

/** Earliest (scheduledAt - 1h) over matches the tournament sweep would still remind about. */
async function nextMatchMoment(prisma, now) {
  const rows = await prisma.$queryRaw`
    SELECT MIN(m."scheduledAt") AS "at"
    FROM "TournamentMatch" m
    JOIN "Tournament" t ON t."id" = m."tournamentId"
    WHERE m."status" = 'SCHEDULED'
      AND m."scheduledAt" > ${now}
      AND m."homeTeamId" IS NOT NULL
      AND m."awayTeamId" IS NOT NULL
      AND t."status" = 'IN_PROGRESS'
      AND (m."details" IS NULL OR m."details"->>'reminderSentAt' IS NULL)`;
  const at = rows && rows[0] && rows[0].at;
  return at ? new Date(at).getTime() - TOURNAMENT_LEAD_MS : null;
}

/**
 * @returns {Promise<number|null>} epoch ms of the next sweep worth running, or null when no
 *   reminder is pending. May be in the past (a reminder that is due right now): the scheduler
 *   floors every wake at its own minimum gap and uses "overdue" to detect sweeps that skip it.
 */
async function planNextReminderWake({ prisma, now = new Date() }) {
  const [game, match] = await Promise.all([nextGameMoment(prisma, now), nextMatchMoment(prisma, now)]);
  const moments = [game, match].filter((v) => v != null);
  if (!moments.length) return null;
  return Math.min(...moments) + SLACK_MS;
}

module.exports = { planNextReminderWake, nextGameMoment, nextMatchMoment, SLACK_MS };
