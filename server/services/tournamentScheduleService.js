// Schedule generation (preview / commit) through the shared engines, plus manual match edits with
// conflict detection. Day windows are interpreted in Asia/Jerusalem (DST-safe) and stored as UTC.
const crypto = require('crypto');
const { Prisma } = require('@prisma/client');
const { prisma, TournamentError, lockTournament, loadForRole } = require('./tournamentService');
const { generateRoundRobin, flattenRounds, splitIntoGroups } = require('../shared/tournament/roundRobin');
const { generateBracket, groupRankSeeds } = require('../shared/tournament/bracket');
const { scheduleMatches, findConflicts } = require('../shared/tournament/scheduler');
const { parseJerusalemTimeToUTC } = require('../shared/timezone');

const err = (status, code, message, extra) => new TournamentError(status, code, message, extra);
const UNFINISHED = ['SCHEDULED', 'LIVE', 'POSTPONED', 'CANCELLED'];
const DONE = ['FINISHED', 'FORFEIT'];
const REMINDER_KEY = 'reminderSentAt';

/** details minus internal bookkeeping (the reminder sentinel lives in the same JSON column). */
function publicDetails(details) {
  if (!details || typeof details !== 'object') return details || null;
  const { [REMINDER_KEY]: _omit, ...rest } = details;
  return Object.keys(rest).length ? rest : null;
}

const teamRef = (team) => (team ? { id: team.id, name: team.name, color: team.color, logoUrl: team.logoUrl } : null);

function serializeMatch(m) {
  return {
    id: m.id,
    number: m.number,
    stageId: m.stageId,
    groupId: m.groupId,
    round: m.round,
    status: m.status,
    home: { teamId: m.homeTeamId, team: teamRef(m.homeTeam), source: m.homeSource || null },
    away: { teamId: m.awayTeamId, team: teamRef(m.awayTeam), source: m.awaySource || null },
    scheduledAt: m.scheduledAt,
    fieldId: m.fieldId,
    courtLabel: m.courtLabel,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    homePenalties: m.homePenalties,
    awayPenalties: m.awayPenalties,
    details: publicDetails(m.details),
    winnerTeamId: m.winnerTeamId,
    version: m.version,
  };
}

const MATCH_INCLUDE = {
  homeTeam: { select: { id: true, name: true, color: true, logoUrl: true } },
  awayTeam: { select: { id: true, name: true, color: true, logoUrl: true } },
};

// ---- plan building (pure given the teams) ------------------------------------------------

/** Seed order: explicit seed first, then registration order. */
const orderTeams = (teams) => teams.slice().sort((a, b) => {
  const sa = a.seed == null ? Infinity : a.seed;
  const sb = b.seed == null ? Infinity : b.seed;
  return sa - sb || a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1);
});

function slotFromBracket(slot, byeReal) {
  if (slot.source && (slot.source.type === 'WINNER_OF' || slot.source.type === 'LOSER_OF') && byeReal.has(slot.source.matchId)) {
    const real = byeReal.get(slot.source.matchId);
    return { teamId: real.teamId, source: real.source && real.source.type === 'GROUP_RANK' ? real.source : null };
  }
  return { teamId: slot.teamId, source: slot.source && slot.source.type !== 'BYE' ? slot.source : null };
}

/**
 * Turns the tournament format into stages / groups / matches with symbolic keys.
 * Sources reference other matches / groups by key; persist() swaps keys for real ids.
 */
function buildPlan(t, teams, { seed } = {}) {
  const rules = t.rules || {};
  const teamIds = orderTeams(teams).map((x) => x.id);
  if (teamIds.length < 2) throw err(409, 'TOO_FEW_TEAMS', 'At least two approved teams are needed');
  const shuffle = rules.seeding === 'RANDOM';
  const plan = { stages: [], matches: [] };
  const addRoundRobin = (stageKey, groupKey, ids, legs, keyPrefix) => {
    const rr = generateRoundRobin(ids, { legs, shuffle, seed: `${seed}:${keyPrefix}` });
    flattenRounds(rr).forEach((m, i) => {
      plan.matches.push({
        key: `${keyPrefix}-${m.round}-${i}`, stageKey, groupKey, round: m.round,
        home: { teamId: m.home, source: null }, away: { teamId: m.away, source: null }, dependsOn: [],
      });
    });
  };
  const addBracket = (stageKey, entries, groupMatchKeys) => {
    const bracket = generateBracket(entries, { seeding: groupMatchKeys ? 'MANUAL' : (rules.seeding || 'MANUAL'), seed: `${seed}:ko`, thirdPlace: !!rules.thirdPlace });
    const keyOf = (id) => `ko-${id}`;
    const byeReal = new Map();
    bracket.matches.filter((m) => m.status === 'BYE').forEach((m) => {
      byeReal.set(m.id, m.home.source && m.home.source.type === 'BYE' ? m.away : m.home);
    });
    for (const m of bracket.matches) {
      if (m.status === 'BYE') continue;
      const slots = [slotFromBracket(m.home, byeReal), slotFromBracket(m.away, byeReal)];
      const dependsOn = [];
      const toSource = (s) => {
        if (!s.source) return null;
        if (s.source.type === 'GROUP_RANK') {
          (groupMatchKeys[s.source.groupId] || []).forEach((k) => dependsOn.push(k));
          return { type: 'GROUP_RANK', groupKey: s.source.groupId, rank: s.source.rank };
        }
        dependsOn.push(keyOf(s.source.matchId));
        return { type: s.source.type, matchKey: keyOf(s.source.matchId) };
      };
      const home = { teamId: slots[0].teamId, source: toSource(slots[0]) };
      const away = { teamId: slots[1].teamId, source: toSource(slots[1]) };
      plan.matches.push({
        key: keyOf(m.id), stageKey, groupKey: null, round: m.round, home, away,
        dependsOn: [...new Set(dependsOn)],
        isThirdPlace: m.isThirdPlace,
      });
    }
    return bracket;
  };

  if (t.format === 'CUSTOM') throw err(400, 'CUSTOM_FORMAT', 'CUSTOM tournaments are scheduled by hand');
  if (t.format === 'LEAGUE') {
    plan.stages.push({ key: 's0', order: 0, type: 'LEAGUE', name: 'League', config: { legs: rules.legs || 1 }, groups: [] });
    addRoundRobin('s0', null, teamIds, rules.legs || 1, 'l');
  } else if (t.format === 'KNOCKOUT') {
    plan.stages.push({ key: 's0', order: 0, type: 'KNOCKOUT', name: 'Knockout', config: { thirdPlace: !!rules.thirdPlace, seeding: rules.seeding || 'MANUAL' }, groups: [] });
    addBracket('s0', teamIds, null);
  } else if (t.format === 'GROUPS_KNOCKOUT') {
    const groupCount = Math.min(rules.groupCount || 2, Math.floor(teamIds.length / 2));
    if (groupCount < 1) throw err(409, 'TOO_FEW_TEAMS', 'Not enough teams for a group stage');
    const split = splitIntoGroups(teamIds, groupCount, { shuffle, seed: `${seed}:groups` });
    const advance = Math.min(rules.advancePerGroup || 2, Math.min(...split.map((g) => g.length)));
    if (groupCount * advance < 2) throw err(409, 'TOO_FEW_TEAMS', 'At least two teams must advance from the groups');
    const groups = split.map((ids, i) => ({ key: `g${i}`, name: `Group ${String.fromCharCode(65 + i)}`, teamIds: ids }));
    plan.stages.push({ key: 's0', order: 0, type: 'GROUP', name: 'Groups', config: { groupCount, legs: rules.legs || 1 }, groups });
    plan.stages.push({ key: 's1', order: 1, type: 'KNOCKOUT', name: 'Knockout', config: { advancePerGroup: advance, thirdPlace: !!rules.thirdPlace }, groups: [] });
    const groupMatchKeys = {};
    groups.forEach((g) => {
      addRoundRobin('s0', g.key, g.teamIds, rules.legs || 1, g.key);
      groupMatchKeys[g.key] = plan.matches.filter((m) => m.groupKey === g.key).map((m) => m.key);
    });
    // Interleave group rounds so the scheduler fills round 1 of every group before round 2.
    plan.matches.sort((a, b) => a.round - b.round);
    addBracket('s1', groupRankSeeds(groups.map((g) => g.key), advance), groupMatchKeys);
  } else {
    throw err(400, 'UNKNOWN_FORMAT', 'Unknown tournament format');
  }
  return plan;
}

function dayWindows(schedule) {
  const out = [];
  for (const w of schedule.windows || []) {
    if (!w || Number.isNaN(Date.parse(w.start)) || Number.isNaN(Date.parse(w.end))) throw err(400, 'VALIDATION', 'windows need ISO start/end');
    out.push({ start: new Date(w.start).toISOString(), end: new Date(w.end).toISOString() });
  }
  for (const d of schedule.days || []) {
    const ok = d && /^\d{4}-\d{2}-\d{2}$/.test(d.date) && /^\d{2}:\d{2}$/.test(d.from) && /^\d{2}:\d{2}$/.test(d.to);
    if (!ok) throw err(400, 'VALIDATION', 'days need { date: YYYY-MM-DD, from: HH:mm, to: HH:mm } (Asia/Jerusalem)');
    const start = parseJerusalemTimeToUTC(d.date, d.from);
    const end = parseJerusalemTimeToUTC(d.date, d.to);
    if (!(end > start)) throw err(400, 'VALIDATION', 'a day window must end after it starts');
    out.push({ start: start.toISOString(), end: end.toISOString() });
  }
  return out;
}

function placeMatches(t, plan, scheduleInput) {
  const s = scheduleInput || {};
  const windows = dayWindows(s);
  if (!windows.length) return { placed: new Map(), conflicts: [] };
  const rules = t.rules || {};
  const num = (v, d) => (Number.isFinite(v) ? v : d);
  const result = scheduleMatches(
    plan.matches.map((m) => ({
      id: m.key,
      homeTeamId: m.home.teamId,
      awayTeamId: m.away.teamId,
      dependsOn: m.dependsOn,
    })),
    {
      windows,
      courts: Array.isArray(s.courts) || Number.isInteger(s.courts) ? s.courts : 1,
      matchMinutes: num(s.matchMinutes, rules.matchMinutes || 60),
      breakMinutes: num(s.breakMinutes, rules.breakMinutes || 0),
      minRestMinutes: num(s.minRestMinutes, rules.minRestMinutes || 0),
      stepMinutes: num(s.stepMinutes, 5),
    },
  );
  return { placed: new Map(result.scheduled.map((x) => [x.matchId, x])), conflicts: result.conflicts };
}

function previewShape(plan, placed) {
  let number = 0;
  const ordered = plan.matches.slice().sort((a, b) => stageOrder(plan, a) - stageOrder(plan, b) || a.round - b.round);
  return {
    stages: plan.stages.map((st) => ({
      key: st.key, order: st.order, type: st.type, name: st.name, config: st.config,
      groups: st.groups.map((g) => ({ key: g.key, name: g.name, teamIds: g.teamIds })),
    })),
    matches: ordered.map((m) => {
      number += 1;
      const p = placed.get(m.key);
      return {
        key: m.key, number, stageKey: m.stageKey, groupKey: m.groupKey, round: m.round,
        home: m.home, away: m.away,
        scheduledAt: p ? p.scheduledAt : null,
        courtLabel: p ? String(p.court) : null,
      };
    }),
  };
}

const stageOrder = (plan, m) => plan.stages.find((s) => s.key === m.stageKey).order;

async function loadApprovedTeams(db, tournamentId) {
  return db.tournamentTeam.findMany({ where: { tournamentId, status: 'APPROVED' } });
}

/**
 * POST /:id/schedule/generate. preview = true returns the proposal without writing anything.
 * Commit replaces the unfinished schedule; it refuses once any result exists.
 */
async function generateSchedule(user, tournamentId, body, { preview }) {
  const b = body || {};
  const run = async (db) => {
    const { tournament: t } = await loadForRole(db, tournamentId, user, 'MANAGER');
    if (!['REGISTRATION_CLOSED', 'IN_PROGRESS'].includes(t.status)) {
      throw err(409, 'WRONG_STATUS', 'Close registration before generating the schedule');
    }
    const teams = await loadApprovedTeams(db, tournamentId);
    const plan = buildPlan(t, teams, { seed: b.seed || t.id });
    const { placed, conflicts } = placeMatches(t, plan, b.schedule);
    return { t, teams, plan, placed, conflicts };
  };
  if (preview) {
    const r = await run(prisma);
    return { preview: true, ...previewShape(r.plan, r.placed), conflicts: r.conflicts, teamCount: r.teams.length };
  }
  const out = await prisma.$transaction(async (tx) => {
    await lockTournament(tx, tournamentId);
    const r = await run(tx);
    if (r.conflicts.length && b.allowConflicts !== true) {
      throw err(409, 'SCHEDULE_CONFLICTS', 'Some matches could not be scheduled', { conflicts: r.conflicts });
    }
    const finished = await tx.tournamentMatch.count({ where: { tournamentId, status: { in: DONE } } });
    if (finished) throw err(409, 'SCHEDULE_HAS_RESULTS', 'The schedule can no longer be regenerated: matches already have results');
    await tx.tournamentStage.deleteMany({ where: { tournamentId } }); // cascades matches + groups
    const { plan, placed, t } = r;
    const stageId = {}; const groupId = {}; const matchId = {};
    for (const st of plan.stages) {
      const row = await tx.tournamentStage.create({
        data: { tournamentId, order: st.order, type: st.type, name: st.name, config: st.config },
      });
      stageId[st.key] = row.id;
      for (const g of st.groups) {
        const grow = await tx.tournamentGroup.create({ data: { stageId: row.id, name: g.name } });
        groupId[g.key] = grow.id;
        await tx.tournamentTeam.updateMany({ where: { id: { in: g.teamIds } }, data: { groupId: grow.id } });
      }
    }
    if (!plan.stages.some((s) => s.groups.length)) {
      await tx.tournamentTeam.updateMany({ where: { tournamentId, groupId: { not: null } }, data: { groupId: null } });
    }
    plan.matches.forEach((m) => { matchId[m.key] = crypto.randomUUID(); });
    const resolveSource = (src) => {
      if (!src) return null;
      if (src.type === 'GROUP_RANK') return { type: 'GROUP_RANK', groupId: groupId[src.groupKey], rank: src.rank, pos: src.rank };
      return { type: src.type, matchId: matchId[src.matchKey] };
    };
    const ordered = previewShape(plan, placed).matches;
    const byKey = new Map(plan.matches.map((m) => [m.key, m]));
    const rows = ordered.map((om) => {
      const m = byKey.get(om.key);
      const p = placed.get(m.key);
      return {
        id: matchId[m.key],
        tournamentId,
        stageId: stageId[m.stageKey],
        groupId: m.groupKey ? groupId[m.groupKey] : null,
        round: m.round,
        number: om.number,
        homeTeamId: m.home.teamId,
        awayTeamId: m.away.teamId,
        homeSource: resolveSource(m.home.source) || undefined,
        awaySource: resolveSource(m.away.source) || undefined,
        scheduledAt: p ? new Date(p.scheduledAt) : null,
        courtLabel: p ? String(p.court) : null,
        fieldId: t.fieldId,
      };
    });
    await tx.tournamentMatch.createMany({ data: rows });
    return { count: rows.length, conflicts: r.conflicts, scheduledIds: rows.filter((x) => x.scheduledAt).map((x) => x.id), t };
  }, { timeout: 30000, maxWait: 10000 });
  return { preview: false, matchCount: out.count, scheduledCount: out.scheduledIds.length, scheduledMatchIds: out.scheduledIds, conflicts: out.conflicts, t: out.t };
}

// ---- manual edits ------------------------------------------------------------------------

async function conflictsFor(db, t, matchId, overrides = {}) {
  const rows = await db.tournamentMatch.findMany({
    where: { tournamentId: t.id, scheduledAt: { not: null }, status: { notIn: ['CANCELLED', 'POSTPONED'] } },
  });
  const rules = t.rules || {};
  const entries = rows.filter((m) => m.id !== matchId).map((m) => ({
    id: m.id, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId,
    scheduledAt: m.scheduledAt.toISOString(), court: m.courtLabel || `none:${m.id}`,
  }));
  if (overrides.scheduledAt && !['CANCELLED', 'POSTPONED'].includes(overrides.status)) {
    entries.push({
      id: matchId, homeTeamId: overrides.homeTeamId || null, awayTeamId: overrides.awayTeamId || null,
      scheduledAt: overrides.scheduledAt.toISOString(), court: overrides.courtLabel || `none:${matchId}`,
    });
  }
  return findConflicts(entries, {
    matchMinutes: rules.matchMinutes || 60,
    breakMinutes: rules.breakMinutes || 0,
    minRestMinutes: rules.minRestMinutes || 0,
  }).filter((c) => c.matchIds.includes(matchId));
}

async function assertApprovedTeam(db, tournamentId, teamId) {
  if (!teamId) return;
  const team = await db.tournamentTeam.findFirst({ where: { id: teamId, tournamentId, status: 'APPROVED' }, select: { id: true } });
  if (!team) throw err(400, 'TEAM_NOT_ELIGIBLE', 'Team is not an approved team of this tournament');
}

function parseOptionalDate(v, name) {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw err(400, 'VALIDATION', `${name} must be an ISO date`);
  return d;
}

async function createMatch(user, tournamentId, body) {
  const b = body || {};
  return prisma.$transaction(async (tx) => {
    await lockTournament(tx, tournamentId);
    const { tournament: t } = await loadForRole(tx, tournamentId, user, 'MANAGER');
    if (['COMPLETED', 'CANCELLED'].includes(t.status)) throw err(409, 'TOURNAMENT_CLOSED', 'Tournament is finished');
    let stage;
    const stages = await tx.tournamentStage.findMany({ where: { tournamentId }, orderBy: { order: 'asc' } });
    if (b.stageId) {
      stage = stages.find((s) => s.id === b.stageId);
      if (!stage) throw err(400, 'VALIDATION', 'stageId does not belong to this tournament');
    } else if (stages.length === 0) {
      stage = await tx.tournamentStage.create({ data: { tournamentId, order: 0, type: 'LEAGUE', name: 'Matches', config: {} } });
    } else if (stages.length === 1) {
      [stage] = stages;
    } else {
      throw err(400, 'VALIDATION', 'stageId is required when the tournament has several stages');
    }
    if (b.groupId) {
      const g = await tx.tournamentGroup.findFirst({ where: { id: b.groupId, stageId: stage.id }, select: { id: true } });
      if (!g) throw err(400, 'VALIDATION', 'groupId does not belong to the stage');
    }
    if (b.homeTeamId && b.homeTeamId === b.awayTeamId) throw err(400, 'VALIDATION', 'A team cannot play itself');
    await assertApprovedTeam(tx, tournamentId, b.homeTeamId);
    await assertApprovedTeam(tx, tournamentId, b.awayTeamId);
    const scheduledAt = parseOptionalDate(b.scheduledAt, 'scheduledAt') || null;
    if (b.round !== undefined && (!Number.isInteger(b.round) || b.round < 1 || b.round > 100)) throw err(400, 'VALIDATION', 'round must be 1-100');
    if (b.fieldId) {
      const f = await tx.field.findUnique({ where: { id: b.fieldId }, select: { id: true } });
      if (!f) throw err(400, 'VALIDATION', 'fieldId not found');
    }
    const id = crypto.randomUUID();
    const conflicts = scheduledAt
      ? await conflictsFor(tx, t, id, { scheduledAt, courtLabel: b.courtLabel, homeTeamId: b.homeTeamId, awayTeamId: b.awayTeamId })
      : [];
    if (conflicts.length && b.force !== true) throw err(409, 'SCHEDULE_CONFLICT', 'The match conflicts with the schedule', { conflicts });
    const max = await tx.tournamentMatch.aggregate({ where: { tournamentId }, _max: { number: true } });
    const row = await tx.tournamentMatch.create({
      data: {
        id, tournamentId, stageId: stage.id, groupId: b.groupId || null, round: b.round || 1,
        number: (max._max.number || 0) + 1,
        homeTeamId: b.homeTeamId || null, awayTeamId: b.awayTeamId || null,
        scheduledAt, courtLabel: typeof b.courtLabel === 'string' ? b.courtLabel.slice(0, 40) : null,
        fieldId: b.fieldId || t.fieldId || null,
      },
      include: MATCH_INCLUDE,
    });
    return { match: serializeMatch(row), conflicts, t, scheduleChanged: !!scheduledAt };
  });
}

async function updateMatch(user, tournamentId, matchId, body) {
  const b = body || {};
  return prisma.$transaction(async (tx) => {
    await lockTournament(tx, tournamentId);
    const { tournament: t } = await loadForRole(tx, tournamentId, user, 'MANAGER');
    if (['COMPLETED', 'CANCELLED'].includes(t.status)) throw err(409, 'TOURNAMENT_CLOSED', 'Tournament is finished');
    const m = await tx.tournamentMatch.findFirst({ where: { id: matchId, tournamentId } });
    if (!m) throw err(404, 'MATCH_NOT_FOUND', 'Match not found');
    const done = DONE.includes(m.status);
    const data = {};
    for (const side of ['home', 'away']) {
      const k = `${side}TeamId`;
      if (b[k] === undefined) continue;
      if (done) throw err(409, 'MATCH_FINISHED', 'Teams of a finished match cannot change');
      if (m[`${side}Source`]) throw err(409, 'SLOT_HAS_SOURCE', 'This slot is filled automatically from another match');
      await assertApprovedTeam(tx, tournamentId, b[k]);
      data[k] = b[k] || null;
    }
    const home = data.homeTeamId !== undefined ? data.homeTeamId : m.homeTeamId;
    const away = data.awayTeamId !== undefined ? data.awayTeamId : m.awayTeamId;
    if (home && home === away) throw err(400, 'VALIDATION', 'A team cannot play itself');
    const scheduledAt = parseOptionalDate(b.scheduledAt, 'scheduledAt');
    const scheduleChanged = scheduledAt !== undefined && (scheduledAt ? scheduledAt.getTime() : null) !== (m.scheduledAt ? m.scheduledAt.getTime() : null);
    if (scheduledAt !== undefined) data.scheduledAt = scheduledAt;
    if (b.courtLabel !== undefined) data.courtLabel = typeof b.courtLabel === 'string' ? b.courtLabel.slice(0, 40) : null;
    if (b.fieldId !== undefined) {
      if (b.fieldId && !(await tx.field.findUnique({ where: { id: b.fieldId }, select: { id: true } }))) throw err(400, 'VALIDATION', 'fieldId not found');
      data.fieldId = b.fieldId || null;
    }
    if (b.round !== undefined) {
      if (!Number.isInteger(b.round) || b.round < 1 || b.round > 100) throw err(400, 'VALIDATION', 'round must be 1-100');
      data.round = b.round;
    }
    if (b.status !== undefined) {
      if (!['SCHEDULED', 'LIVE', 'POSTPONED', 'CANCELLED'].includes(b.status)) throw err(400, 'VALIDATION', 'status must be SCHEDULED, LIVE, POSTPONED or CANCELLED (results set FINISHED/FORFEIT)');
      if (done) throw err(409, 'MATCH_FINISHED', 'Use the result endpoint to change a finished match');
      data.status = b.status;
    }
    if (!Object.keys(data).length) return { match: serializeMatch(await tx.tournamentMatch.findUnique({ where: { id: matchId }, include: MATCH_INCLUDE })), conflicts: [], t, scheduleChanged: false };
    const finalAt = data.scheduledAt !== undefined ? data.scheduledAt : m.scheduledAt;
    const finalStatus = data.status || m.status;
    const conflicts = finalAt
      ? await conflictsFor(tx, t, matchId, {
        scheduledAt: finalAt, status: finalStatus, homeTeamId: home, awayTeamId: away,
        courtLabel: data.courtLabel !== undefined ? data.courtLabel : m.courtLabel,
      })
      : [];
    if (conflicts.length && b.force !== true && (scheduleChanged || data.courtLabel !== undefined || data.homeTeamId !== undefined || data.awayTeamId !== undefined)) {
      throw err(409, 'SCHEDULE_CONFLICT', 'The change conflicts with the schedule', { conflicts });
    }
    if (scheduleChanged && m.details && m.details[REMINDER_KEY]) {
      // A new time re-arms the "starting soon" reminder.
      const { [REMINDER_KEY]: _drop, ...rest } = m.details;
      data.details = Object.keys(rest).length ? rest : Prisma.DbNull;
    }
    const row = await tx.tournamentMatch.update({ where: { id: matchId }, data, include: MATCH_INCLUDE });
    return { match: serializeMatch(row), conflicts, t, scheduleChanged };
  });
}

async function deleteMatch(user, tournamentId, matchId) {
  return prisma.$transaction(async (tx) => {
    await lockTournament(tx, tournamentId);
    const { tournament: t } = await loadForRole(tx, tournamentId, user, 'MANAGER');
    const m = await tx.tournamentMatch.findFirst({ where: { id: matchId, tournamentId } });
    if (!m) throw err(404, 'MATCH_NOT_FOUND', 'Match not found');
    if (DONE.includes(m.status)) throw err(409, 'MATCH_FINISHED', 'A finished match cannot be removed');
    const all = await tx.tournamentMatch.findMany({ where: { tournamentId, id: { not: matchId } }, select: { id: true, homeSource: true, awaySource: true } });
    const refs = all.filter((x) => [x.homeSource, x.awaySource].some((s) => s && s.matchId === matchId));
    if (refs.length) throw err(409, 'MATCH_REFERENCED', 'Other matches take their teams from this match', { matchIds: refs.map((x) => x.id) });
    await tx.tournamentMatch.delete({ where: { id: matchId } });
    return { ok: true, t };
  });
}

module.exports = {
  buildPlan,
  generateSchedule,
  createMatch,
  updateMatch,
  deleteMatch,
  serializeMatch,
  publicDetails,
  MATCH_INCLUDE,
  REMINDER_KEY,
  DONE,
  UNFINISHED,
};
