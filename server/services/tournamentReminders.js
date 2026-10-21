// "Starting soon" reminders for tournament matches. Runs from the leader-locked jobs runtime
// (services/jobsRuntime.js), so one process sweeps; the claim below makes a second sweeper (or a
// stale one after a leader hand-over) a no-op anyway.
const { formatJerusalemTime } = require('../shared/timezone');

const LEAD_MS = 60 * 60 * 1000;
const SENTINEL = 'reminderSentAt';

/**
 * Atomically marks a match as reminded. The WHERE re-checks status and due time, so a match that
 * was rescheduled later (or already reminded) is never claimed twice. Returns true for the winner.
 */
async function claimReminder(prisma, matchId, now) {
  const until = new Date(now.getTime() + LEAD_MS);
  const count = await prisma.$executeRaw`
    UPDATE "TournamentMatch"
    SET "details" = COALESCE("details", '{}'::jsonb) || jsonb_build_object(${SENTINEL}::text, ${now.toISOString()}::text)
    WHERE "id" = ${matchId}
      AND "status" = 'SCHEDULED'
      AND "scheduledAt" > ${now} AND "scheduledAt" <= ${until}
      AND ("details" IS NULL OR "details"->>${SENTINEL}::text IS NULL)`;
  return count === 1;
}

async function runReminderSweep({ prisma, notificationService, io = null, now = new Date(), shouldContinue = () => true }) {
  const until = new Date(now.getTime() + LEAD_MS);
  const due = await prisma.tournamentMatch.findMany({
    where: {
      status: 'SCHEDULED',
      scheduledAt: { gt: now, lte: until },
      homeTeamId: { not: null },
      awayTeamId: { not: null },
      tournament: { status: 'IN_PROGRESS' },
    },
    include: {
      tournament: { select: { id: true, title: true } },
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
    },
    orderBy: { scheduledAt: 'asc' },
    take: 200,
  });
  let reminded = 0;
  for (const m of due) {
    if (!shouldContinue()) break;
    if (m.details && m.details[SENTINEL]) continue;
    if (!(await claimReminder(prisma, m.id, now))) continue;
    const members = await prisma.tournamentTeamMember.findMany({
      where: { teamId: { in: [m.homeTeamId, m.awayTeamId] }, status: 'ACCEPTED' },
      select: { userId: true },
    });
    const userIds = [...new Set(members.map((x) => x.userId))];
    await notificationService.sendNotificationToMany(
      userIds,
      'TOURNAMENT_STARTING_SOON',
      'המשחק בטורניר מתחיל בקרוב',
      `${m.homeTeam.name} נגד ${m.awayTeam.name} מתחיל ב-${formatJerusalemTime(m.scheduledAt)} (${m.tournament.title})`,
      { tournamentId: m.tournament.id, matchId: m.id, link: `/tournaments/${m.tournament.id}`, type: 'TOURNAMENT_STARTING_SOON' },
      io,
    );
    reminded += 1;
  }
  return { reminded };
}

module.exports = { runReminderSweep, claimReminder, LEAD_MS };
