// Tournament notifications: team invite, team decision, match scheduled, starting soon.
// Deliberately NO notification for results (clients see them on refresh / the socket event).
// Every function swallows its own errors: a failed push must never fail the request that caused it.
const { prisma } = require('../lib/prisma');
const { NotificationService } = require('./notificationService');
const { publicDisplayName } = require('../utils/publicName');
const notifCopy = require('../utils/notificationCopy');
const { filterViewableUserIds } = require('../utils/tournamentGate');
const { formatJerusalemDate, formatJerusalemTime } = require('../shared/timezone');

const notificationService = new NotificationService(prisma);

const safe = (label, fn) => async (...args) => {
  try {
    return await fn(...args);
  } catch (e) {
    console.error(`[tournament-notify] ${label} failed:`, e && e.message);
    return null;
  }
};

const link = (tournamentId) => `/tournaments/${tournamentId}`;
const when = (d) => `${formatJerusalemDate(d)} ${formatJerusalemTime(d)}`;

async function acceptedUserIds(db, teamIds) {
  const rows = await db.tournamentTeamMember.findMany({
    where: { teamId: { in: teamIds.filter(Boolean) }, status: 'ACCEPTED' },
    select: { userId: true },
  });
  return [...new Set(rows.map((r) => r.userId))];
}

/** Captain invited `inviteeId` to `team`. */
const notifyTeamInvite = safe('invite', async ({ tournament, team, inviterId, inviteeId, io }) => {
  if (!(await filterViewableUserIds([inviteeId])).length) return null;
  const inviter = await prisma.user.findUnique({ where: { id: inviterId }, select: { name: true } });
  const who = publicDisplayName(inviter && inviter.name, null);
  const c = notifCopy.tournamentTeamInvite({ name: who, teamName: team.name, tournamentTitle: tournament.title });
  return notificationService.sendNotification(
    inviteeId,
    'TOURNAMENT_TEAM_INVITE',
    c.title,
    c.body,
    { tournamentId: tournament.id, teamId: team.id, actorId: inviterId, link: link(tournament.id), type: 'TOURNAMENT_TEAM_INVITE', ...notifCopy.enData(c) },
    io,
  );
});

/** The captain learns the organizer's decision (or a waitlist promotion: pass the new status). */
const notifyTeamDecision = safe('decision', async ({ tournament, team, status, io }) => {
  const c = notifCopy.tournamentTeamDecision({ status, teamName: team.name, tournamentTitle: tournament.title });
  if (!c) return null;
  if (!(await filterViewableUserIds([team.captainId])).length) return null;
  return notificationService.sendNotification(
    team.captainId,
    'TOURNAMENT_TEAM_DECISION',
    c.title,
    c.body,
    { tournamentId: tournament.id, teamId: team.id, status, link: link(tournament.id), type: 'TOURNAMENT_TEAM_DECISION', ...notifCopy.enData(c) },
    io,
  );
});

/** Promoted waitlist teams: tells each captain the status the team now has. */
const notifyPromoted = safe('promoted', async ({ tournament, teamIds, io }) => {
  if (!teamIds || !teamIds.length) return null;
  const teams = await prisma.tournamentTeam.findMany({ where: { id: { in: teamIds } } });
  for (const team of teams) {
    await notifyTeamDecision({ tournament, team, status: team.status, io });
  }
  return teams.length;
});

/**
 * Players learn when their matches were scheduled. One notification per player per call: a single
 * match gets its own text, several (bulk generation) are summarised.
 */
const notifyMatchesScheduled = safe('scheduled', async ({ tournament, matchIds, io }) => {
  const matches = await prisma.tournamentMatch.findMany({
    where: { id: { in: matchIds }, tournamentId: tournament.id, scheduledAt: { not: null }, status: 'SCHEDULED' },
    include: { homeTeam: { select: { id: true, name: true } }, awayTeam: { select: { id: true, name: true } } },
    orderBy: { scheduledAt: 'asc' },
  });
  const playable = matches.filter((m) => m.homeTeamId && m.awayTeamId);
  if (!playable.length) return 0;
  const teamIds = [...new Set(playable.flatMap((m) => [m.homeTeamId, m.awayTeamId]))];
  const rows = await prisma.tournamentTeamMember.findMany({
    where: { teamId: { in: teamIds }, status: 'ACCEPTED' },
    select: { userId: true, teamId: true },
  });
  const viewable = new Set(await filterViewableUserIds(rows.map((r) => r.userId)));
  const byUser = new Map();
  for (const r of rows) {
    if (!viewable.has(r.userId)) continue;
    const mine = playable.filter((m) => m.homeTeamId === r.teamId || m.awayTeamId === r.teamId);
    if (!mine.length) continue;
    byUser.set(r.userId, [...(byUser.get(r.userId) || []), ...mine]);
  }
  let sent = 0;
  for (const [userId, list] of byUser) {
    const unique = [...new Map(list.map((m) => [m.id, m])).values()];
    const single = unique.length === 1 ? unique[0] : null;
    const c = notifCopy.tournamentMatchScheduled({
      single,
      count: unique.length,
      whenText: single ? when(single.scheduledAt) : '',
      firstWhen: when(unique[0].scheduledAt),
      tournamentTitle: tournament.title,
    });
    await notificationService.sendNotification(
      userId,
      'TOURNAMENT_MATCH_SCHEDULED',
      c.title,
      c.body,
      { tournamentId: tournament.id, matchId: single ? single.id : undefined, link: link(tournament.id), type: 'TOURNAMENT_MATCH_SCHEDULED', ...notifCopy.enData(c) },
      io,
    ).catch((e) => console.error('[tournament-notify] scheduled recipient failed:', e && e.message));
    sent += 1;
  }
  return sent;
});

module.exports = {
  notificationService,
  acceptedUserIds,
  notifyTeamInvite,
  notifyTeamDecision,
  notifyPromoted,
  notifyMatchesScheduled,
};
