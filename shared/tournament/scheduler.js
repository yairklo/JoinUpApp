// Match scheduler: greedy earliest-slot assignment under court / time-window / rest constraints.
// Pure and deterministic: matches are placed in the order given, courts are tried in order.
// Anything that cannot be placed is returned as a conflict, never dropped silently.

const MINUTE = 60 * 1000;

function toMs(value) {
  const ms = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error(`invalid date: ${value}`);
  return ms;
}

function normalizeConfig(config) {
  const matchMinutes = config.matchMinutes;
  if (!Number.isFinite(matchMinutes) || matchMinutes <= 0) throw new Error('matchMinutes must be a positive number');
  const courts = Array.isArray(config.courts)
    ? config.courts.slice()
    : Array.from({ length: config.courts === undefined ? 1 : config.courts }, (_, i) => i + 1);
  if (courts.length < 1) throw new Error('at least one court is required');
  const windows = (config.windows || [])
    .map((w) => ({ start: toMs(w.start), end: toMs(w.end) }))
    .sort((a, b) => a.start - b.start);
  return {
    matchMs: matchMinutes * MINUTE,
    breakMs: (config.breakMinutes || 0) * MINUTE,
    restMs: (config.minRestMinutes || 0) * MINUTE,
    stepMs: (config.stepMinutes || 5) * MINUTE,
    courts,
    windows,
    existing: config.existing || [],
  };
}

const teamsOf = (m) => [m.homeTeamId, m.awayTeamId].filter(Boolean);

/** Intervals [s, e) overlap when each starts before the other ends, each padded by `pad`. */
const clashes = (s1, e1, s2, e2, pad) => s1 < e2 + pad && s2 < e1 + pad;

/**
 * Assign times and courts.
 * matches: { id, homeTeamId?, awayTeamId?, durationMinutes?, notBefore?: ISO, dependsOn?: matchId[] }.
 *   Missing team ids (TBD bracket slots) just skip the team checks; use dependsOn to order bracket rounds.
 * config: { windows: [{ start: ISO, end: ISO }], courts: number | string[], matchMinutes, breakMinutes?,
 *           minRestMinutes?, stepMinutes? (candidate start granularity, default 5),
 *           existing?: [{ id, homeTeamId, awayTeamId, scheduledAt, court, durationMinutes? }] (fixed, already placed) }.
 * Returns { scheduled: [{ matchId, scheduledAt, endsAt, court }], conflicts: [{ type, matchIds, message }] }.
 * A match waits at least minRestMinutes after the dependencies it lists end.
 */
function scheduleMatches(matches, config) {
  const cfg = normalizeConfig(config);
  const placed = []; // { id, s, e, court, teams }
  cfg.existing.forEach((x) => {
    const s = toMs(x.scheduledAt);
    placed.push({ id: x.id, s, e: s + (x.durationMinutes ? x.durationMinutes * MINUTE : cfg.matchMs), court: x.court, teams: teamsOf(x) });
  });
  const byId = new Map(placed.map((p) => [p.id, p]));
  const scheduled = [];
  const conflicts = [];
  let pending = matches.slice();

  const fits = (s, e, court, teams) => !placed.some((p) => (
    (p.court === court && clashes(s, e, p.s, p.e, cfg.breakMs))
    || (p.teams.some((t) => teams.includes(t)) && clashes(s, e, p.s, p.e, cfg.restMs))
  ));

  const place = (m) => {
    const dur = (m.durationMinutes ? m.durationMinutes * MINUTE : cfg.matchMs);
    let lower = m.notBefore ? toMs(m.notBefore) : -Infinity;
    (m.dependsOn || []).forEach((d) => { lower = Math.max(lower, byId.get(d).e + cfg.restMs); });
    const teams = teamsOf(m);
    for (const w of cfg.windows) {
      if (w.end - w.start < dur) continue;
      let s = w.start;
      if (lower > s) s += Math.ceil((lower - s) / cfg.stepMs) * cfg.stepMs;
      for (; s + dur <= w.end; s += cfg.stepMs) {
        const court = cfg.courts.find((c) => fits(s, s + dur, c, teams));
        if (court !== undefined) {
          const rec = { id: m.id, s, e: s + dur, court, teams };
          placed.push(rec);
          byId.set(m.id, rec);
          scheduled.push({ matchId: m.id, scheduledAt: new Date(s).toISOString(), endsAt: new Date(s + dur).toISOString(), court });
          return true;
        }
      }
    }
    return false;
  };

  // Repeat passes so a match can follow its dependencies regardless of input order.
  let progress = true;
  while (pending.length && progress) {
    progress = false;
    const stillPending = [];
    pending.forEach((m) => {
      const waiting = (m.dependsOn || []).filter((d) => !byId.has(d));
      if (waiting.length) { stillPending.push(m); return; }
      progress = true;
      if (!place(m)) {
        conflicts.push({ type: 'NO_SLOT', matchIds: [m.id], message: `no free court/time slot for match ${m.id}` });
      }
    });
    pending = stillPending;
  }
  pending.forEach((m) => {
    const failed = new Set(conflicts.flatMap((c) => c.matchIds));
    const unknown = (m.dependsOn || []).filter((d) => !byId.has(d));
    const blocked = unknown.some((d) => failed.has(d));
    conflicts.push({
      type: 'DEPENDENCY_UNSCHEDULED',
      matchIds: [m.id, ...unknown],
      message: blocked
        ? `match ${m.id} depends on a match that could not be scheduled`
        : `match ${m.id} depends on unknown matches: ${unknown.join(', ')}`,
    });
  });
  return { scheduled, conflicts };
}

/**
 * Validate a (possibly hand-edited) schedule against the same rules.
 * entries: { id, homeTeamId?, awayTeamId?, scheduledAt, court, durationMinutes? }.
 * config: same as scheduleMatches; `windows` is optional here (omit to skip the window check).
 * Conflict types: COURT_OVERLAP, TEAM_OVERLAP (double booking), TEAM_REST, OUTSIDE_WINDOW.
 */
function findConflicts(entries, config) {
  const cfg = normalizeConfig(config);
  const items = entries.map((x) => {
    const s = toMs(x.scheduledAt);
    return { id: x.id, s, e: s + (x.durationMinutes ? x.durationMinutes * MINUTE : cfg.matchMs), court: x.court, teams: teamsOf(x) };
  });
  const conflicts = [];
  if (cfg.windows.length) {
    items.forEach((it) => {
      if (!cfg.windows.some((w) => it.s >= w.start && it.e <= w.end)) {
        conflicts.push({ type: 'OUTSIDE_WINDOW', matchIds: [it.id], message: `match ${it.id} is outside every time window` });
      }
    });
  }
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i];
      const b = items[j];
      const ids = [a.id, b.id];
      if (a.court === b.court && clashes(a.s, a.e, b.s, b.e, cfg.breakMs)) {
        conflicts.push({ type: 'COURT_OVERLAP', matchIds: ids, court: a.court, message: `matches ${a.id} and ${b.id} collide on court ${a.court}` });
      }
      a.teams.filter((t) => b.teams.includes(t)).forEach((teamId) => {
        if (clashes(a.s, a.e, b.s, b.e, 0)) {
          conflicts.push({ type: 'TEAM_OVERLAP', matchIds: ids, teamId, message: `team ${teamId} is booked in ${a.id} and ${b.id} at the same time` });
        } else if (clashes(a.s, a.e, b.s, b.e, cfg.restMs)) {
          conflicts.push({ type: 'TEAM_REST', matchIds: ids, teamId, message: `team ${teamId} has too little rest between ${a.id} and ${b.id}` });
        }
      });
    }
  }
  return conflicts;
}

module.exports = { scheduleMatches, findConflicts };
