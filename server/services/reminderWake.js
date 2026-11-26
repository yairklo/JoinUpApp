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

function epoch(value) {
  if (value == null) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

// `future` is the earliest moment still strictly after `now`. When the query only selected the
// overall minimum (or that minimum is itself still ahead), derive it so a past minimum cannot
// be mistaken for "nothing else coming".
function momentsFrom(earliest, future, nowMs) {
  let next = future;
  if (next == null && earliest != null && earliest > nowMs) next = earliest;
  if (next != null && next <= nowMs) next = null;
  return { earliest, future: next };
}

/**
 * Earliest moment any CONFIRMED participant of an OPEN, future game should be reminded,
 * and the earliest such moment that is still in the future.
 * Per participant: moment = start - lead (lead from their settings, default when absent/0).
 *  - gameRemindersEnabled=false AND gameRemindersInApp=false -> never reminded (remindPage skip)
 *  - GameReminderSent row for (user, game, start)            -> already reminded (dedupe key)
 *  - joined at/after the moment, or lead changed after it    -> isReminderDue is false forever
 * @returns {Promise<{ earliest: number|null, future: number|null }>}
 */
async function nextGameMoment(prisma, now) {
  const rows = await prisma.$queryRaw`
    SELECT
      MIN(x."moment") AS "moment",
      MIN(x."moment") FILTER (WHERE x."moment" > ${now}) AS "future"
    FROM (
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
  const row = rows && rows[0];
  return momentsFrom(epoch(row && row.moment), epoch(row && row.future), now.getTime());
}

/**
 * Earliest (scheduledAt - 1h) over matches the tournament sweep would still remind about,
 * and the earliest of those moments that is still in the future.
 * @returns {Promise<{ earliest: number|null, future: number|null }>}
 */
async function nextMatchMoment(prisma, now) {
  const futureAfter = new Date(now.getTime() + TOURNAMENT_LEAD_MS);
  const rows = await prisma.$queryRaw`
    SELECT
      MIN(m."scheduledAt") AS "at",
      MIN(m."scheduledAt") FILTER (WHERE m."scheduledAt" > ${futureAfter}) AS "futureAt"
    FROM "TournamentMatch" m
    JOIN "Tournament" t ON t."id" = m."tournamentId"
    WHERE m."status" = 'SCHEDULED'
      AND m."scheduledAt" > ${now}
      AND m."homeTeamId" IS NOT NULL
      AND m."awayTeamId" IS NOT NULL
      AND t."status" = 'IN_PROGRESS'
      AND (m."details" IS NULL OR m."details"->>'reminderSentAt' IS NULL)`;
  const row = rows && rows[0];
  const at = epoch(row && row.at);
  const futureAt = epoch(row && row.futureAt);
  return momentsFrom(
    at == null ? null : at - TOURNAMENT_LEAD_MS,
    futureAt == null ? null : futureAt - TOURNAMENT_LEAD_MS,
    now.getTime(),
  );
}

/**
 * @returns {Promise<{ at: number, nextFuture: number|null }|null>}
 *   `at` is the earliest pending moment (may be in the past: a reminder due right now). The
 *   scheduler floors every wake at its own minimum gap and treats "overdue" as the signal to
 *   back off when a sweep sends nothing. `nextFuture` is the earliest moment still ahead, so
 *   that back-off cannot hide a different reminder that comes due during the wait. Null when
 *   nothing is pending.
 */
async function planNextReminderWake({ prisma, now = new Date() }) {
  const [game, match] = await Promise.all([nextGameMoment(prisma, now), nextMatchMoment(prisma, now)]);
  const moments = [game.earliest, match.earliest].filter((v) => v != null);
  if (!moments.length) return null;
  const futures = [game.future, match.future].filter((v) => v != null);
  return {
    at: Math.min(...moments) + SLACK_MS,
    nextFuture: futures.length ? Math.min(...futures) + SLACK_MS : null,
  };
}

module.exports = { planNextReminderWake, nextGameMoment, nextMatchMoment, SLACK_MS };
