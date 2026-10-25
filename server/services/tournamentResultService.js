// Match results with optimistic concurrency, slot advancement, optional player stats and the
// computed views (standings, bracket, schedule, leaders). Automatic standings are never stored:
// a manager may store a manual order plus additive points adjustments (see putStandingsOverride).
const { Prisma } = require('@prisma/client');
const { prisma, TournamentError, lockTournament, loadForViewer, loadForRole } = require('./tournamentService');
const { serializeMatch, MATCH_INCLUDE, DONE, REMINDER_KEY } = require('./tournamentScheduleService');
const { applyStandingsOverride, computeStandings } = require('../shared/tournament/standings');
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
 * The teams that belong in one table: APPROVED teams plus WITHDRAWN teams that appear in `matches`
 * (their forfeited matches still count for the opponents). Shared by getStandings and resolveSlots.
 */
function tableTeams(teams, matches) {
  const inMatches = new Set(matches.flatMap((m) => [m.homeTeamId, m.awayTeamId]).filter(Boolean));
  return teams.filter((x) => x.status === 'APPROVED' || (x.status === 'WITHDRAWN' && inMatches.has(x.id)));
}

/** `stageId` for a league table, `stageId:groupId` for a group. Avoids Postgres unique-null collisions. */
function standingsTableKey(stageId, groupId) {
  return groupId ? `${stageId}:${groupId}` : stageId;
}

const autoRowExtras = (r) => ({
  autoPoints: r.points,
  pointsAdjustment: 0,
  adjustmentReason: null,
  manualOrder: false,
});

/**
 * Ranks `teams` from `matches`.
 * When `override` is set, its order is the table order until reset and points adjustments are
 * added to the automatic points (see applyStandingsOverride). Per-team manualRank pins are not
 * applied in that case.
 * Without an override, a manualRank pins that team at that position (clamped to the table size);
 * the other teams fill the remaining positions in computed order. Two pins on the same position:
 * the better computed rank keeps it and the other takes the nearest free position below (above
 * when none is left).
 * `unresolved` rows are ties the tiebreakers could not separate and no manualRank (and no table
 * override) resolves.
 */
function rankTable(t, teams, matches, override = null) {
  const rows = computeStandings(teams.map((x) => x.id), matches.map(toStandingsMatch), standingsOptions(t));
  const byId = new Map(teams.map((x) => [x.id, x]));
  const decorated = rows.map((r) => ({
    ...r, manualRank: byId.get(r.teamId).manualRank ?? null, withdrawn: byId.get(r.teamId).status === 'WITHDRAWN',
  }));
  if (override) return applyStandingsOverride(decorated, override);
  const n = decorated.length;
  const slots = new Array(n).fill(null);
  const pinned = decorated.filter((r) => r.manualRank != null).sort((a, b) => a.manualRank - b.manualRank || a.rank - b.rank);
  for (const r of pinned) {
    let pos = Math.min(Math.max(r.manualRank, 1), n) - 1;
    while (pos < n && slots[pos]) pos += 1;
    if (pos >= n) pos = slots.lastIndexOf(null);
    slots[pos] = r;
  }
  const rest = decorated.filter((r) => r.manualRank == null);
  let next = 0;
  for (let i = 0; i < n; i += 1) {
    if (!slots[i]) { slots[i] = rest[next]; next += 1; }
  }
  return slots.map((r, i) => ({
    ...r, ...autoRowExtras(r), rank: i + 1, unresolved: r.tied && r.manualRank == null,
  }));
}

const groupComplete = (matches) => matches.length > 0 && matches.every((m) => DONE.includes(m.status));

// ---- slot resolution ---------------------------------------------------------------------

/**
 * Recomputes every sourced slot (WINNER_OF / LOSER_OF / GROUP_RANK / LEAGUE_RANK) from current
 * results and persists the differences. A finished match whose teams would change is a conflict:
 * refused unless `force`, in which case its result is reset (and its own dependents re-resolved).
 * League-fed slots use the same table getStandings shows (manual order and points adjustments).
 */
async function resolveSlots(tx, t, { force }) {
  const [stages, matchRows, teams, overrides] = await Promise.all([
    tx.tournamentStage.findMany({ where: { tournamentId: t.id }, select: { id: true, order: true, type: true } }),
    tx.tournamentMatch.findMany({ where: { tournamentId: t.id } }),
    tx.tournamentTeam.findMany({ where: { tournamentId: t.id, status: { in: ['APPROVED', 'WITHDRAWN'] } }, select: { id: true, groupId: true, manualRank: true, status: true } }),
    tx.tournamentStandingsOverride.findMany({ where: { tournamentId: t.id }, include: { adjustments: true } }),
  ]);
  const stageOrder = new Map(stages.map((s) => [s.id, s.order]));
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const ms = matchRows.map((m) => ({ ...m }));
  const byId = new Map(ms.map((m) => [m.id, m]));
  ms.sort((a, b) => stageOrder.get(a.stageId) - stageOrder.get(b.stageId) || a.round - b.round || a.number - b.number);
  const dirty = new Map(); // id -> { reset }

  const groupRanking = (groupId) => {
    const gm = ms.filter((m) => m.groupId === groupId);
    if (!groupComplete(gm)) return null;
    const override = overrides.find((o) => o.groupId === groupId) || null;
    return rankTable(t, tableTeams(teams.filter((x) => x.groupId === groupId), gm), gm, override);
  };
  // One league stage is one table (no group). Same membership and override key as getStandings.
  const leagueRanking = (stageId) => {
    const stage = stageById.get(stageId);
    if (!stage || stage.type !== 'LEAGUE') return null;
    const lm = ms.filter((m) => m.stageId === stageId);
    if (!groupComplete(lm)) return null;
    const override = overrides.find((o) => o.tableKey === standingsTableKey(stageId, null)) || null;
    const ids = new Set(lm.flatMap((m) => [m.homeTeamId, m.awayTeamId]).filter(Boolean));
    return rankTable(t, tableTeams(teams.filter((x) => ids.has(x.id)), lm), lm, override);
  };
  const teamAtRank = (table, src) => {
    const row = table && table[(src.rank || src.pos) - 1];
    return row && !row.unresolved ? row.teamId : null;
  };
  const desiredFor = (src) => {
    if (!src) return undefined;
    if (src.type === 'GROUP_RANK') {
      // groupId set: group table (unchanged). No groupId: the league table named by stageId.
      const table = src.groupId ? groupRanking(src.groupId) : leagueRanking(src.stageId);
      return teamAtRank(table, src);
    }
    if (src.type === 'LEAGUE_RANK') return teamAtRank(leagueRanking(src.stageId), src);
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
    // The reminder sentinel shares the details column; a result must not wipe it (no repeat reminder).
    const keep = match.details && match.details[REMINDER_KEY] ? { [REMINDER_KEY]: match.details[REMINDER_KEY] } : null;
    const details = outcome.details || keep ? { ...(outcome.details || {}), ...(keep || {}) } : null;
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

/** Re-resolves group-rank slots, e.g. after the organizer set a manualRank to break a tie. */
async function recomputeAdvancement(user, tournamentId) {
  return prisma.$transaction(async (tx) => {
    await lockTournament(tx, tournamentId);
    const { tournament: t } = await loadForRole(tx, tournamentId, user, 'MANAGER');
    return { changedMatchIds: await resolveSlots(tx, t, { force: false }) };
  });
}

/**
 * Forfeits (or postpones, when the opponent is unknown) the unfinished matches of a team that withdrew.
 * Runs on the caller's transaction (which already holds the tournament lock) so withdrawing and
 * forfeiting are atomic. A forfeit also clears stale details (keeping the reminder sentinel),
 * penalties and the match's player stats. Returns the ids of every match it touched.
 */
async function forfeitTeamMatchesTx(tx, t, user, teamId) {
  const matches = await tx.tournamentMatch.findMany({
    where: { tournamentId: t.id, status: { in: ['SCHEDULED', 'LIVE', 'POSTPONED'] }, OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] },
  });
  const fs = (t.rules || {}).forfeitScore || { winner: 3, loser: 0 };
  const flagged = [];
  const forfeitedIds = [];
  for (const m of matches) {
    const opponent = m.homeTeamId === teamId ? m.awayTeamId : m.homeTeamId;
    if (!opponent) {
      await tx.tournamentMatch.update({ where: { id: m.id }, data: { status: 'POSTPONED', version: { increment: 1 }, updatedById: user.id } });
    } else {
      const homeWins = opponent === m.homeTeamId;
      const keep = m.details && m.details[REMINDER_KEY] ? { [REMINDER_KEY]: m.details[REMINDER_KEY] } : null;
      await tx.tournamentMatch.update({
        where: { id: m.id },
        data: {
          status: 'FORFEIT', winnerTeamId: opponent, homeScore: homeWins ? fs.winner : fs.loser, awayScore: homeWins ? fs.loser : fs.winner,
          homePenalties: null, awayPenalties: null, details: keep || Prisma.DbNull,
          version: { increment: 1 }, updatedById: user.id,
        },
      });
      forfeitedIds.push(m.id);
    }
    flagged.push(m.id);
  }
  if (forfeitedIds.length) await tx.playerStatEntry.deleteMany({ where: { tournamentMatchId: { in: forfeitedIds } } });
  if (flagged.length) await resolveSlots(tx, t, { force: false }).catch((e) => { if (!(e instanceof TournamentError)) throw e; });
  return flagged;
}

/** Standalone wrapper around forfeitTeamMatchesTx (withdrawTeam calls the Tx form inside its own transaction). */
async function forfeitWithdrawnTeam(user, tournamentId, teamId) {
  return prisma.$transaction(async (tx) => {
    await lockTournament(tx, tournamentId);
    const t = await tx.tournament.findUnique({ where: { id: tournamentId } });
    return { matchIds: await forfeitTeamMatchesTx(tx, t, user, teamId) };
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
  const [stages, matches, teams, overrides] = await Promise.all([
    prisma.tournamentStage.findMany({ where: { tournamentId, type: { not: 'KNOCKOUT' } }, orderBy: { order: 'asc' }, include: { groups: { orderBy: { name: 'asc' } } } }),
    prisma.tournamentMatch.findMany({ where: { tournamentId } }),
    prisma.tournamentTeam.findMany({ where: { tournamentId, status: { in: ['APPROVED', 'WITHDRAWN'] } } }),
    prisma.tournamentStandingsOverride.findMany({ where: { tournamentId }, include: { adjustments: true } }),
  ]);
  const overrideByKey = new Map(overrides.map((o) => [o.tableKey, o]));
  const tables = [];
  const build = (stage, group, tTeams, tMatches) => {
    const groupId = group ? group.id : null;
    const override = overrideByKey.get(standingsTableKey(stage.id, groupId)) || null;
    const rows = rankTable(t, tTeams, tMatches, override);
    const byId = new Map(tTeams.map((x) => [x.id, x]));
    tables.push({
      stageId: stage.id, stageName: stage.name, stageType: stage.type,
      groupId, groupName: group ? group.name : null,
      complete: groupComplete(tMatches),
      needsManualRank: !override && groupComplete(tMatches) && rows.some((r) => r.unresolved),
      manualOrder: !!override,
      rows: rows.map((r) => ({
        rank: r.rank, team: teamRef(byId.get(r.teamId)), played: r.played, won: r.won, drawn: r.drawn, lost: r.lost,
        gf: r.gf, ga: r.ga, gd: r.gd, points: r.points,
        autoPoints: r.autoPoints, pointsAdjustment: r.pointsAdjustment, adjustmentReason: r.adjustmentReason,
        tied: r.tied, manualRank: r.manualRank, withdrawn: r.withdrawn,
      })),
    });
  };
  for (const stage of stages) {
    const stageMatches = matches.filter((m) => m.stageId === stage.id);
    if (stage.type === 'GROUP') {
      for (const g of stage.groups) {
        const gm = stageMatches.filter((m) => m.groupId === g.id);
        build(stage, g, tableTeams(teams.filter((x) => x.groupId === g.id), gm), gm);
      }
    } else {
      const ids = new Set(stageMatches.flatMap((m) => [m.homeTeamId, m.awayTeamId]).filter(Boolean));
      build(stage, null, tableTeams(teams.filter((x) => ids.has(x.id)), stageMatches), stageMatches);
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

// ---- manual standings override -----------------------------------------------------------
// Interaction (also documented on GET /standings in docs/plans/2026-10-tournaments-api-contract.md):
// - No override row: the table is the automatic ranking (manualRank pins still break ties).
// - An override row keeps `teamOrder` until a manager deletes it. New results recompute
//   played / W/D/L / goals / automatic points on the next read and do not reshuffle that order.
//   Teams missing from teamOrder (added later) append in automatic order.
// - Points adjustments are added to the automatic points. They do not change W/D/L or goals
//   and they do not re-sort the table.
// - Knockout GROUP_RANK slots follow the same order viewers see. A knockout slot seeded from a
//   league table (LEAGUE_RANK, or GROUP_RANK with stageId and no groupId) uses that league table
//   too: the published order, with points adjustments already applied to the rows. Changing it
//   is refused when a finished downstream match would have to change (OVERRIDE_BLOCKED); the
//   write rolls back.
// - Only ORGANIZER and MANAGER may write. SCOREKEEPER cannot.

const ADJUSTMENT_MIN = -100;
const ADJUSTMENT_MAX = 100;
const REASON_MAX = 200;

function parseTeamOrder(raw, teamIds) {
  if (!Array.isArray(raw) || raw.length !== teamIds.size || raw.length === 0) {
    throw err(400, 'VALIDATION', 'teamOrder must list every team in the table exactly once');
  }
  const seen = new Set();
  for (const id of raw) {
    if (typeof id !== 'string' || !teamIds.has(id) || seen.has(id)) {
      throw err(400, 'VALIDATION', 'teamOrder must list every team in the table exactly once');
    }
    seen.add(id);
  }
  return raw.slice();
}

function parseAdjustments(raw, teamIds) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw err(400, 'VALIDATION', 'adjustments must be an array');
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') throw err(400, 'VALIDATION', 'invalid adjustment');
    const teamId = item.teamId;
    if (typeof teamId !== 'string' || !teamIds.has(teamId) || seen.has(teamId)) {
      throw err(400, 'VALIDATION', 'each adjustment teamId must be a team in this table, once');
    }
    const points = item.points;
    if (!Number.isInteger(points) || points === 0 || points < ADJUSTMENT_MIN || points > ADJUSTMENT_MAX) {
      throw err(400, 'VALIDATION', 'adjustment points must be a non-zero integer from -100 to 100');
    }
    const reason = typeof item.reason === 'string' ? item.reason.trim() : '';
    if (!reason || reason.length > REASON_MAX) {
      throw err(400, 'VALIDATION', 'an adjustment needs a reason of 1 to 200 characters');
    }
    seen.add(teamId);
    out.push({ teamId, points, reason });
  }
  return out;
}

/** Teams and matches of one group or league table. Same membership rules as getStandings. */
async function loadTableSlice(tx, tournamentId, stageId, rawGroupId) {
  const stage = await tx.tournamentStage.findFirst({
    where: { id: stageId, tournamentId },
    include: { groups: { select: { id: true } } },
  });
  if (!stage) throw err(404, 'NOT_FOUND', 'Stage not found');
  if (stage.type === 'KNOCKOUT') throw err(400, 'VALIDATION', 'A knockout stage has no standings table');
  let groupId = null;
  if (stage.type === 'GROUP') {
    if (typeof rawGroupId !== 'string' || !stage.groups.some((g) => g.id === rawGroupId)) {
      throw err(400, 'VALIDATION', 'groupId must be a group of this stage');
    }
    groupId = rawGroupId;
  } else if (rawGroupId) {
    throw err(400, 'VALIDATION', 'A league table has no groupId');
  }
  const matches = await tx.tournamentMatch.findMany({
    where: { tournamentId, stageId, ...(groupId ? { groupId } : {}) },
  });
  const teams = await tx.tournamentTeam.findMany({
    where: { tournamentId, status: { in: ['APPROVED', 'WITHDRAWN'] } },
    select: { id: true, groupId: true, status: true },
  });
  let slice = teams;
  if (groupId) slice = teams.filter((x) => x.groupId === groupId);
  else {
    const ids = new Set(matches.flatMap((m) => [m.homeTeamId, m.awayTeamId]).filter(Boolean));
    slice = teams.filter((x) => ids.has(x.id));
  }
  const table = tableTeams(slice, matches);
  if (!table.length) throw err(400, 'VALIDATION', 'This table has no teams');
  return { stage, groupId, teams: table };
}

async function writeOverride(tx, t, user, body) {
  const b = body || {};
  if (t.status === 'DRAFT' || t.status === 'CANCELLED') {
    throw err(409, 'TOURNAMENT_CLOSED', 'Standings cannot be edited on a draft or cancelled tournament');
  }
  if (typeof b.stageId !== 'string' || !b.stageId) throw err(400, 'VALIDATION', 'stageId is required');
  const slice = await loadTableSlice(tx, t.id, b.stageId, b.groupId || null);
  const teamIds = new Set(slice.teams.map((x) => x.id));
  const teamOrder = parseTeamOrder(b.teamOrder, teamIds);
  const adjustments = parseAdjustments(b.adjustments, teamIds);
  const tableKey = standingsTableKey(slice.stage.id, slice.groupId);
  const existing = await tx.tournamentStandingsOverride.findUnique({ where: { tableKey } });
  const row = existing
    ? await tx.tournamentStandingsOverride.update({
      where: { id: existing.id },
      data: { teamOrder, updatedById: user.id },
    })
    : await tx.tournamentStandingsOverride.create({
      data: {
        tournamentId: t.id,
        stageId: slice.stage.id,
        groupId: slice.groupId,
        tableKey,
        teamOrder,
        createdById: user.id,
        updatedById: user.id,
      },
    });
  await tx.tournamentStandingsAdjustment.deleteMany({ where: { overrideId: row.id } });
  if (adjustments.length) {
    await tx.tournamentStandingsAdjustment.createMany({
      data: adjustments.map((a) => ({ ...a, overrideId: row.id })),
    });
  }
  return recomputeAfterOverride(tx, t);
}

async function recomputeAfterOverride(tx, t) {
  try {
    return await resolveSlots(tx, t, { force: false });
  } catch (e) {
    if (e instanceof TournamentError && e.code === 'DOWNSTREAM_FINISHED') {
      throw err(409, 'OVERRIDE_BLOCKED', 'A finished knockout match depends on this order', {
        matchId: e.extra && e.extra.matchId,
        matchNumber: e.extra && e.extra.matchNumber,
      });
    }
    throw e;
  }
}

/** Manager+: save the manual order (and optional points adjustments) for one table. */
async function putStandingsOverride(user, tournamentId, body) {
  return prisma.$transaction(async (tx) => {
    await lockTournament(tx, tournamentId);
    const { tournament: t } = await loadForRole(tx, tournamentId, user, 'MANAGER');
    const changedMatchIds = await writeOverride(tx, t, user, body);
    return { ok: true, changedMatchIds };
  });
}

/** Manager+: delete the override so the table returns to automatic ranking. */
async function deleteStandingsOverride(user, tournamentId, body) {
  const b = body || {};
  return prisma.$transaction(async (tx) => {
    await lockTournament(tx, tournamentId);
    const { tournament: t } = await loadForRole(tx, tournamentId, user, 'MANAGER');
    if (typeof b.stageId !== 'string' || !b.stageId) throw err(400, 'VALIDATION', 'stageId is required');
    const groupId = b.groupId || null;
    const row = await tx.tournamentStandingsOverride.findUnique({
      where: { tableKey: standingsTableKey(b.stageId, groupId) },
    });
    if (!row || row.tournamentId !== tournamentId) throw err(404, 'NOT_FOUND', 'No standings override');
    await tx.tournamentStandingsOverride.delete({ where: { id: row.id } });
    const changedMatchIds = await recomputeAfterOverride(tx, t);
    return { ok: true, changedMatchIds };
  });
}

module.exports = {
  putResult,
  forfeitWithdrawnTeam,
  forfeitTeamMatchesTx,
  tableTeams,
  recomputeAdvancement,
  resolveSlots,
  rankTable,
  putStandingsOverride,
  deleteStandingsOverride,
  getSchedule,
  getStandings,
  getBracket,
  getLeaders,
};
