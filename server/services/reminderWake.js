// "When can the next reminder sweep first matter?" — two indexed single-row lookups plus the
// horizon aggregate, so an idle stretch costs the DB nothing between wakes. Pairs with
// services/reminderScheduler.js. The filters mirror what the sweeps themselves select.
const { reminderHorizonMs } = require('./gameReminders');
const { LEAD_MS: TOURNAMENT_LEAD_MS } = require('./tournamentReminders');

/**
 * @returns {Promise<number|null>} epoch ms of the next sweep, or null when nothing is upcoming
 *   (the scheduler then stays asleep until a nudge). Never earlier than now + activeMs, which is
 *   the old fixed sweep cadence.
 */
async function planNextReminderWake({ prisma, now = new Date(), activeMs = 5 * 60 * 1000 }) {
  const horizonMs = await reminderHorizonMs(prisma);
  const [game, match] = await Promise.all([
    prisma.game.findFirst({
      where: { status: 'OPEN', start: { gt: now } },
      orderBy: { start: 'asc' },
      select: { start: true },
    }),
    prisma.tournamentMatch.findFirst({
      where: {
        status: 'SCHEDULED',
        scheduledAt: { gt: now },
        homeTeamId: { not: null },
        awayTeamId: { not: null },
        tournament: { status: 'IN_PROGRESS' },
      },
      orderBy: { scheduledAt: 'asc' },
      select: { scheduledAt: true },
    }),
  ]);
  const opens = [];
  if (game) opens.push(new Date(game.start).getTime() - horizonMs);
  if (match) opens.push(new Date(match.scheduledAt).getTime() - TOURNAMENT_LEAD_MS);
  if (!opens.length) return null;
  return Math.max(Math.min(...opens), now.getTime() + activeMs);
}

module.exports = { planNextReminderWake };
