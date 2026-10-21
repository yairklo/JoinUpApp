// Match results with optimistic concurrency, slot advancement, optional player stats and the
// computed views (standings, bracket, schedule, leaders). Standings are never stored.
const { Prisma } = require('@prisma/client');
const { prisma, TournamentError, lockTournament, loadForViewer, loadForRole } = require('./tournamentService');
const { serializeMatch, MATCH_INCLUDE, DONE, REMINDER_KEY } = require('./tournamentScheduleService');
const { computeStandings } = require('../shared/tournament/standings');
const { roundName } = require('../shared/tournament/bracket');
const {
  validateResult, validateStats, checkPlayerTotals, getStatKeys, getSummaryKeys, getStatLabel,
} = require('../shared/matchStats');
const { publicDisplayName } = require('../utils/publicName');

const err = (status, code, message, extra) => new TournamentError(status, code, message, extra);
const nonNegInt = (v) => Number.isInteger(v) && v >= 0 && v <= 1000;

// ---- standings / ranking -----------------------------------------------------------------

function standingsOptions(t) {
  const r = t.rules || {};
  return { points: r.points, tiebreak: r.tiebreak, forfeitScore: r.forfeitScore, seed: t.id };
}

const toStandingsMatch = (m) => ({
  homeTeamId: m.homeTeamId,
  awayTeamId: m.awayTeamId,
  homeScore: m.homeScore,
  awayScore: m.awayScore,
  status: m.status,
  // A forfeit is stored as a win for the other team.
  forfeitBy: m.status === 'FORFEIT' ? (m.winnerTeamId === m.homeTeamId ? m.awayTeamId : m.homeTeamId) : null,
});

/**
 * Ranks `teams` from `matches`, applying the organizer's manualRank override.
 * `unresolved` rows are ties the tiebreakers could not separate and no manualRank resolves.
 */
function rankTable(t, teams, matches) {
  const rows = computeStandings(teams.map((x) => x.id), matches.map(toStandingsMatch), standingsOptions(t));
  const byId = new Map(teams.map((x) => [x.id, x]));
  const decorated = rows.map((r) => ({ ...r, manualRank: byId.get(r.teamId).manualRank ?? null }));
  decorated.sort((a, b) => {
    const ka = a.manualRank != null ? a.manualRank : a.rank;
    const kb = b.manualRank != null ? b.manualRank : b.rank;
    return ka - kb || a.rank - b.rank;
  });
  return decorated.map((r, i) => ({ ...r, rank: i + 1, unresolved: r.tied && r.manualRank == null }));
}

const groupComplete = (matches) => matches.length > 0 && matches.every((m) => DONE.includes(m.status));

// ---- slot resolution ---------------------------------------------------------------------

/**
 * Recomputes every sourced slot (WINNER_OF / LOSER_OF / GROUP_RANK) from current results and
 * persists the differences. A finished match whose teams would change is a conflict: refused
 * unless `force`, in which case its result is reset (and its own dependents re-resolved).
 */
async function resolveSlots(tx, t, { force }) {
  const [stages, matchRows, teams] = await Promise.all([
    tx.tournamentStage.findMany({ where: { tournamentId: t.id }, select: { id: true, order: true } }),
    tx.tournamentMatch.findMany({ where: { tournamentId: t.id } }),
    tx.tournamentTeam.findMany({ where: { tournamentId: t.id, status: { not: 'WITHDRAWN' } }, select: { id: true, groupId: true, manualRank: true } }),
  ]);
  const stageOrder = new Map(stages.map((s) => [s.id, s.order]));
  const ms = matchRows.map((m) => ({ ...m }));
  const byId = new Map(ms.map((m) => [m.id, m]));
  ms.sort((a, b) => stageOrder.get(a.stageId) - stageOrder.get(b.stageId) || a.round - b.round || a.number - b.number);
  const dirty = new Map(); // id -> { reset }

  const groupRanking = (groupId) => {
    const gm = ms.filter((m) => m.groupId === groupId);
    if (!groupComplete(gm)) return null;
    return rankTable(t, teams.filter((x) => x.groupId === groupId), gm);
  };
  const desiredFor = (src) => {
    if (!src) return undefined;
    if (src.type === 'GROUP_RANK') {
      const table = groupRanking(src.groupId);
      const row = table && table[(src.rank || src.pos) - 1];
      return row && !row.unresolved ? row.teamId : null;
    }
    const from = byId.get(src.matchId);
    if (!from || !DONE.includes(from.status) || !from.winnerTeamId) return null;
    if (src.type === 'WINNER_OF') return from.winnerTeamId;
    return from.winnerTeamId === from.homeTeamId ? from.awayTeamId : from.homeTeamId;
  };

  for (let pass = 0; pass <= ms.length; pass += 1) {
    let changed = false;
    for (const m of ms) {
      for (const side of ['home', 'away']) {
        const src = m[`${side}Source`];
        if (!src) continue;
        const want = desiredFor(src);
        if (want === m[`${side}TeamId`]) continue;
        if (DONE.includes(m.status)) {
          if (!force) {
            throw err(409, 'DOWNSTREAM_FINISHED', 'A later match that depends on this result is already finished', {
              matchId: m.id, matchNumber: m.number, canForce: true,
            });
          }
          Object.assign(m, {
            status: 'SCHEDULED', homeScore: null, awayScore: null, homePenalties: null, awayPenalties: null,
            winnerTeamId: null, details: null,
          });
          dirty.set(m.id, { reset: true });
        }
        m[`${side}TeamId`] = want;
        if (!dirty.has(m.id)) dirty.set(m.id, { reset: false });
        changed = true;
      }
    }
    if (!changed) break;
  }

  for (const [id, { reset }] of dirty) {
    const m = byId.get(id);
    await tx.tournamentMatch.update({
      where: { id },
      data: {
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        version: { increment: 1 },
        ...(reset ? {
          status: 'SCHEDULED', homeScore: null, awayScore: null, homePenalties: null, awayPenalties: null,
          winnerTeamId: null, details: Prisma.DbNull,
        } : {}),
      },
    });
    if (reset) await tx.playerStatEntry.deleteMany({ where: { tournamentMatchId: id } });
  }
  return [...dirty.keys()];
}

// ---- writing a result --------------------------------------------------------------------

function computeOutcome(t, match, stage, b) {
  const status = b.status;
  const rules = t.rules || {};
  if (status === 'SCHEDULED') {
    return { status, homeScore: null, awayScore: null, homePenalties: null, awayPenalties: null, winnerTeamId: null, details: null };
  }
  if (status === 'LIVE') {
    const h = b.homeScore === undefined ? 0 : b.homeScore;
    const a = b.awayScore === undefined ? 0 : b.awayScore;
    if (!nonNegInt(h) || !nonNegInt(a)) throw err(400, 'INVALID_SCORES', 'Scores must be non-negative integers');
    return { status, homeScore: h, awayScore: a, homePenalties: null, awayPenalties: null, winnerTeamId: null, details: null };
  }
  if (status === 'FORFEIT') {
    if (b.forfeitBy !== match.homeTeamId && b.forfeitBy !== match.awayTeamId) throw err(400, 'VALIDATION', 'forfeitBy must be one of the two teams');
    const winnerTeamId = b.forfeitBy === match.homeTeamId ? match.awayTeamId : match.homeTeamId;
    const fs = rules.forfeitScore || { winner: 3, loser: 0 };
    const homeWins = winnerTeamId === match.homeTeamId;
    return {
      status, homeScore: homeWins ? fs.winner : fs.loser, awayScore: homeWins ? fs.loser : fs.winner,
      homePenalties: null, awayPenalties: null, winnerTeamId, details: null,
    };
  }
  if (status !== 'FINISHED') throw err(400, 'VALIDATION', 'status must be FINISHED, FORFEIT, LIVE or SCHEDULED');

  let homeScore;
  let awayScore;
  let details = null;
  let winnerSide = null;
  if (t.sport === 'TENNIS') {
    const sets = b.details && b.details.sets;
    const check = validateResult('TENNIS', { sets, bestOf: rules.bestOf || 3 });
    if (!check.valid) throw err(400, 'INVALID_RESULT', 'Invalid tennis result', { errors: check.errors });
    [homeScore, awayScore] = check.scores;
    winnerSide = check.winner === 0 ? 'home' : 'away';
    details = { sets, bestOf: rules.bestOf || 3 };
  } else {
    if (!nonNegInt(b.homeScore) || !nonNegInt(b.awayScore)) throw err(400, 'INVALID_SCORES', 'homeScore and awayScore must be non-negative integers');
    const check = validateResult(t.sport, { scores: [b.homeScore, b.awayScore] });
    if (!check.valid) throw err(400, 'INVALID_RESULT', 'Invalid result', { errors: check.errors });
    [homeScore, awayScore] = [b.homeScore, b.awayScore];
    winnerSide = homeScore > awayScore ? 'home' : awayScore > homeScore ? 'away' : null;
  }
  let homePenalties = null;
  let awayPenalties = null;
  const p = b.penalties;
  if (p !== undefined && p !== null) {
    if (!nonNegInt(p.home) || !nonNegInt(p.away) || p.home === p.away) throw err(400, 'INVALID_PENALTIES', 'penalties need two different non-negative integers');
    if (winnerSide) throw err(400, 'PENALTIES_NOT_ALLOWED', 'Penalties only apply to a drawn match');
    if (stage.type !== 'KNOCKOUT') throw err(400, 'PENALTIES_NOT_ALLOWED', 'Penalties only decide knockout matches');
    homePenalties = p.home;
    awayPenalties = p.away;
    winnerSide = p.home > p.away ? 'home' : 'away';
  }
  if (!winnerSide && stage.type === 'KNOCKOUT') throw err(400, 'NEEDS_PENALTIES', 'A knockout match needs a winner: add penalties');
  return {
    status, homeScore, awayScore, homePenalties, awayPenalties, details,
    winnerTeamId: winnerSide === 'home' ? match.homeTeamId : winnerSide === 'away' ? match.awayTeamId : null,
  };
}

async function writeStats(tx, t, match, stats) {
  const warnings = [];
  const entries = [];
  const sides = { [match.homeTeamId]: [], [match.awayTeamId]: [] };
  const members = await tx.tournamentTeamMember.findMany({
    where: { teamId: { in: [match.homeTeamId, match.awayTeamId] }, status: 'ACCEPTED' },
    select: { userId: true, teamId: true },
  });
  const teamOf = new Map(members.map((m) => [m.userId, m.teamId]));
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) throw err(400, 'INVALID_STATS', 'stats must be { userId: { key: value } }');
  for (const [userId, values] of Object.entries(stats)) {
    if (!teamOf.has(userId)) throw err(400, 'INVALID_STATS', `User ${userId} is not on either team`, { userId });
    const check = validateStats(t.sport, values);
    if (!check.valid) throw err(400, 'INVALID_STATS', 'Invalid player stats', { userId, errors: check.errors });
    sides[teamOf.get(userId)].push(check.stats);
    for (const [key, value] of Object.entries(check.stats)) entries.push({ tournamentMatchId: match.id, userId, key, value });
  }
  [[match.homeTeamId, match.homeScore], [match.awayTeamId, match.awayScore]].forEach(([teamId, score]) => {
    if (t.sport !== 'TENNIS') warnings.push(...checkPlayerTotals(t.sport, score, sides[teamId]).map((w) => ({ ...w, teamId })));
  });
  await tx.playerStatEntry.deleteMany({ where: { tournamentMatchId: match.id } });
  if (entries.length) await tx.playerStatEntry.createMany({ data: entries });
  return warnings;
}

async function putResult(user, tournamentId, matchId, body) {
  const b = body || {};
  if (!Number.isInteger(b.expectedVersion)) throw err(400, 'VALIDATION', 'expectedVersion (integer) is required');
  return prisma.$transaction(async (tx) => {
    await lockTournament(tx, tournamentId);
    const { tournament: t, role } = await loadForRole(tx, tournamentId, user, 'SCOREKEEPER');
    if (t.status !== 'IN_PROGRESS') throw err(409, 'NOT_IN_PROGRESS', 'Results can only be entered while the tournament is in progress');
    const match = await tx.tournamentMatch.findFirst({ where: { id: matchId, tournamentId }, include: { stage: { select: { type: true } } } });
    if (!match) throw err(404, 'MATCH_NOT_FOUND', 'Match not found');
    if (match.version !== b.expectedVersion) {
      throw err(409, 'VERSION_CONFLICT', 'The match was changed by someone else', { currentVersion: match.version });
    }
    if (match.status === 'CANCELLED') throw err(409, 'MATCH_CANCELLED', 'The match was cancelled');
    if (!match.homeTeamId || !match.awayTeamId) throw err(409, 'TEAMS_UNKNOWN', 'Both teams must be known before a result');
    const outcome = computeOutcome(t, match, match.stage, b);
    const details = outcome.details && match.details && match.details[REMINDER_KEY]
      ? { ...outcome.details, [REMINDER_KEY]: match.details[REMINDER_KEY] }
      : outcome.details;
    const { count } = await tx.tournamentMatch.updateMany({
      where: { id: matchId, version: b.expectedVersion },
      data: { ...outcome, details: details === null ? Prisma.DbNull : details, updatedById: user.id, version: { increment: 1 } },
    });
    if (count !== 1) throw err(409, 'VERSION_CONFLICT', 'The match was changed by someone else');
    const force = b.force === true && role === 'ORGANIZER';
    let changedIds;
    try {
      changedIds = await resolveSlots(tx, t, { force });
    } catch (e) {
      if (e instanceof TournamentError && e.code === 'DOWNSTREAM_FINISHED') e.extra.canForce = role === 'ORGANIZER';
      throw e;
    }
    let warnings = [];
    const fresh = await tx.tournamentMatch.findUnique({ where: { id: matchId }, include: MATCH_INCLUDE });
    if (outcome.status === 'FINISHED' && b.stats !== undefined) {
      warnings = await writeStats(tx, t, fresh, b.stats);
    } else if (outcome.status !== 'FINISHED') {
      await tx.playerStatEntry.deleteMany({ where: { tournamentMatchId: matchId } });
    }
    return { match: serializeMatch(fresh), changedMatchIds: changedIds, warnings, t };
  });
}

/** After a team withdrew: forfeit its unfinished matches (or postpone when the opponent is unknown). */
async function forfeitWithdrawnTeam(user, tournamentId, teamId) {
  return prisma.$transaction(async (tx) => {
    await lockTournament(tx, tournamentId);
    const t = await tx.tournament.findUnique({ where: { id: tournamentId } });
    const matches = await tx.tournamentMatch.findMany({
      where: { tournamentId, status: { in: ['SCHEDULED', 'LIVE', 'POSTPONED'] }, OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] },
    });
    const fs = (t.rules || {}).forfeitScore || { winner: 3, loser: 0 };
    const flagged = [];
    for (const m of matches) {
      const opponent = m.homeTeamId === teamId ? m.awayTeamId : m.homeTeamId;
      if (!opponent) {
        await tx.tournamentMatch.update({ where: { id: m.id }, data: { status: 'POSTPONED', version: { increment: 1 }, updatedById: user.id } });
      } else {
        const homeWins = opponent === m.homeTeamId;
        await tx.tournamentMatch.update({
          where: { id: m.id },
          data: {
            status: 'FORFEIT', winnerTeamId: opponent, homeScore: homeWins ? fs.winner : fs.loser, awayScore: homeWins ? fs.loser : fs.winner,
            version: { increment: 1 }, updatedById: user.id,
          },
        });
      }
      flagged.push(m.id);
    }
    if (flagged.length) await resolveSlots(tx, t, { force: false }).catch((e) => { if (!(e instanceof TournamentError)) throw e; });
    return { matchIds: flagged };
  });
}

// ---- views -------------------------------------------------------------------------------

const teamRef = (x) => ({ id: x.id, name: x.name, color: x.color, logoUrl: x.logoUrl });

async function getSchedule(user, tournamentId, query = {}) {
  const { tournament } = await loadForViewer(prisma, tournamentId, user);
  const where = { tournamentId };
  if (query.teamId) where.OR = [{ homeTeamId: String(query.teamId) }, { awayTeamId: String(query.teamId) }];
  if (query.status) where.status = { in: String(query.status).split(',') };
  if (query.stageId) where.stageId = String(query.stageId);
  const from = query.from ? new Date(query.from) : null;
  const to = query.to ? new Date(query.to) : null;
  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) throw err(400, 'VALIDATION', 'from/to must be ISO dates');
  if (from || to) where.scheduledAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  const [stages, matches] = await Promise.all([
    prisma.tournamentStage.findMany({ where: { tournamentId }, orderBy: { order: 'asc' }, include: { groups: { orderBy: { name: 'asc' } } } }),
    prisma.tournamentMatch.findMany({ where, include: MATCH_INCLUDE, orderBy: [{ scheduledAt: { sort: 'asc', nulls: 'last' } }, { number: 'asc' }] }),
  ]);
  return {
    tournamentId: tournament.id,
    stages: stages.map((s) => ({ id: s.id, order: s.order, type: s.type, name: s.name, config: s.config, groups: s.groups.map((g) => ({ id: g.id, name: g.name })) })),
    matches: matches.map(serializeMatch),
  };
}

async function getStandings(user, tournamentId) {
  const { tournament: t } = await loadForViewer(prisma, tournamentId, user);
  const [stages, matches, teams] = await Promise.all([
    prisma.tournamentStage.findMany({ where: { tournamentId, type: { not: 'KNOCKOUT' } }, orderBy: { order: 'asc' }, include: { groups: { orderBy: { name: 'asc' } } } }),
    prisma.tournamentMatch.findMany({ where: { tournamentId } }),
    prisma.tournamentTeam.findMany({ where: { tournamentId, status: 'APPROVED' } }),
  ]);
  const tables = [];
  const build = (stage, group, tTeams, tMatches) => {
    const rows = rankTable(t, tTeams, tMatches);
    const byId = new Map(tTeams.map((x) => [x.id, x]));
    tables.push({
      stageId: stage.id, stageName: stage.name, stageType: stage.type,
      groupId: group ? group.id : null, groupName: group ? group.name : null,
      complete: groupComplete(tMatches),
      needsManualRank: groupComplete(tMatches) && rows.some((r) => r.unresolved),
      rows: rows.map((r) => ({
        rank: r.rank, team: teamRef(byId.get(r.teamId)), played: r.played, won: r.won, drawn: r.drawn, lost: r.lost,
        gf: r.gf, ga: r.ga, gd: r.gd, points: r.points, tied: r.tied, manualRank: r.manualRank,
      })),
    });
  };
  for (const stage of stages) {
    const stageMatches = matches.filter((m) => m.stageId === stage.id);
    if (stage.type === 'GROUP') {
      for (const g of stage.groups) build(stage, g, teams.filter((x) => x.groupId === g.id), stageMatches.filter((m) => m.groupId === g.id));
    } else {
      const ids = new Set(stageMatches.flatMap((m) => [m.homeTeamId, m.awayTeamId]).filter(Boolean));
      build(stage, null, teams.filter((x) => ids.has(x.id)), stageMatches);
    }
  }
  return { tournamentId, tables };
}

async function getBracket(user, tournamentId) {
  await loadForViewer(prisma, tournamentId, user);
  const stages = await prisma.tournamentStage.findMany({ where: { tournamentId, type: 'KNOCKOUT' }, orderBy: { order: 'asc' } });
  const out = [];
  for (const stage of stages) {
    const rows = await prisma.tournamentMatch.findMany({ where: { stageId: stage.id }, include: MATCH_INCLUDE, orderBy: [{ round: 'asc' }, { number: 'asc' }] });
    const total = rows.reduce((mx, m) => Math.max(mx, m.round), 0);
    const rounds = [];
    for (let r = 1; r <= total; r += 1) {
      const inRound = rows.filter((m) => m.round === r);
      if (inRound.length) {
        rounds.push({
          round: r,
          name: roundName(r, total),
          matches: inRound.map((m) => ({ ...serializeMatch(m), isThirdPlace: !!(m.homeSource && m.homeSource.type === 'LOSER_OF') })),
        });
      }
    }
    out.push({ stageId: stage.id, name: stage.name, rounds });
  }
  return { tournamentId, stages: out };
}

async function getLeaders(user, tournamentId, query = {}) {
  const { tournament: t } = await loadForViewer(prisma, tournamentId, user);
  const keys = getStatKeys(t.sport);
  const key = query.key ? String(query.key) : getSummaryKeys(t.sport)[0];
  if (!keys.includes(key)) throw err(400, 'UNKNOWN_KEY', `key must be one of ${keys.join(', ')}`);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 10, 1), 50);
  const grouped = await prisma.playerStatEntry.groupBy({
    by: ['userId'], where: { key, tournamentMatch: { tournamentId } }, _sum: { value: true }, _count: { _all: true },
    orderBy: [{ _sum: { value: 'desc' } }, { userId: 'asc' }], take: limit * 3,
  });
  const users = await prisma.user.findMany({
    where: { id: { in: grouped.map((g) => g.userId) } }, select: { id: true, name: true, imageUrl: true, hideMatchStats: true },
  });
  const members = await prisma.tournamentTeamMember.findMany({
    where: { tournamentId, userId: { in: grouped.map((g) => g.userId) }, status: 'ACCEPTED' },
    include: { team: { select: { id: true, name: true } } },
  });
  const uById = new Map(users.map((x) => [x.id, x]));
  const teamBy = new Map(members.map((m) => [m.userId, m.team]));
  const leaders = grouped
    .filter((g) => g._sum.value > 0 && uById.has(g.userId) && (!uById.get(g.userId).hideMatchStats || (user && user.id === g.userId)))
    .slice(0, limit)
    .map((g, i) => ({
      rank: i + 1,
      userId: g.userId,
      name: publicDisplayName(uById.get(g.userId).name),
      imageUrl: uById.get(g.userId).imageUrl || null,
      teamId: teamBy.get(g.userId) ? teamBy.get(g.userId).id : null,
      teamName: teamBy.get(g.userId) ? teamBy.get(g.userId).name : null,
      value: g._sum.value,
      matches: g._count._all,
    }));
  return { tournamentId, key, label: { he: getStatLabel(t.sport, key, 'he'), en: getStatLabel(t.sport, key, 'en') }, keys, leaders };
}

module.exports = {
  putResult,
  forfeitWithdrawnTeam,
  resolveSlots,
  rankTable,
  getSchedule,
  getStandings,
  getBracket,
  getLeaders,
};
