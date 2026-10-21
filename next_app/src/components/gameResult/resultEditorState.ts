import { checkPlayerTotals, getStatDefs, validateStats, validateTennisSets, MAX_TEAM_SCORE } from "@joinup/shared/matchStats";
import type { GameResultData, GameResultRosterPlayer, SaveGameResultInput, StatValues } from "@/types/matchResult";

export const NOTES_MAX = 500;
export const SIDE_LABEL_MAX = 40;
export const MAX_TENNIS_SETS = 3;

export interface EditorTeam {
  id: string;
  name: string;
  color: string;
  playerIds: string[];
}

export interface EditorPlayerState {
  sideOrder: 0 | 1 | null;
  values: StatValues;
}

export interface EditorFormState {
  labels: [string, string];
  teamIds: [string | null, string | null];
  scores: [number, number];
  /** Tennis, from side 0's perspective: [side0 games, side1 games]. */
  sets: Array<[number, number]>;
  players: Record<string, EditorPlayerState>;
  notes: string;
}

const DEFAULT_LABELS: [string, string] = ["צד א׳", "צד ב׳"];

function teamOrder(userId: string, teams: EditorTeam[]): 0 | 1 | null {
  const idx = teams.slice(0, 2).findIndex((t) => t.playerIds.includes(userId));
  return idx === 0 ? 0 : idx === 1 ? 1 : null;
}

export function initEditorState(
  sport: string,
  initial: GameResultData | null,
  roster: GameResultRosterPlayer[],
  teams: EditorTeam[]
): EditorFormState {
  const sides = initial ? [...initial.sides].sort((a, b) => a.order - b.order) : [];
  const useTeams = teams.length >= 2;
  const labels: [string, string] = [
    sides[0]?.label || (useTeams ? teams[0].name : DEFAULT_LABELS[0]),
    sides[1]?.label || (useTeams ? teams[1].name : DEFAULT_LABELS[1]),
  ];
  const teamIds: [string | null, string | null] = initial
    ? [sides[0]?.teamId ?? null, sides[1]?.teamId ?? null]
    : [useTeams ? teams[0].id : null, useTeams ? teams[1].id : null];
  const players: Record<string, EditorPlayerState> = {};
  for (const p of roster) {
    const saved = initial?.stats.find((s) => s.userId === p.userId);
    const savedSide = sides.findIndex((s) => s.id === (saved?.sideId ?? p.sideId));
    players[p.userId] = {
      sideOrder: savedSide === 0 ? 0 : savedSide === 1 ? 1 : initial ? null : teamOrder(p.userId, teams),
      values: { ...(saved?.values || {}) },
    };
  }
  return {
    labels,
    teamIds,
    scores: [sides[0]?.score ?? 0, sides[1]?.score ?? 0],
    // Side 0's sets are stored from its own perspective, i.e. [side0, side1].
    sets: sport === "TENNIS" && sides[0]?.sets?.length ? sides[0].sets.map(([a, b]) => [a, b] as [number, number]) : sport === "TENNIS" ? [[0, 0]] : [],
    players,
    notes: initial?.notes ?? "",
  };
}

/** Per-row tennis error codes (index -> code) plus a match-level one. */
export function tennisErrors(sets: Array<[number, number]>): { rows: Record<number, string>; match: string | null; winner: 0 | 1 | null; setsWon: [number, number] } {
  const r = validateTennisSets(sets);
  const rows: Record<number, string> = {};
  let match: string | null = null;
  for (const e of r.errors) {
    if (typeof e.index === "number") rows[e.index] = e.code;
    else match = e.code;
  }
  return { rows, match, winner: r.valid ? (r.winner as 0 | 1) : null, setsWon: [r.setsWon[0], r.setsWon[1]] };
}

export const TENNIS_ERROR_HE: Record<string, string> = {
  INVALID_SET_SCORE: "תוצאת מערכה לא תקינה (לדוגמה 6–4, 7–5, 7–6)",
  INVALID_SET: "תוצאת מערכה לא תקינה (לדוגמה 6–4, 7–5, 7–6)",
  MATCH_INCOMPLETE: "המשחק עוד לא הוכרע, הוסיפו מערכה",
  SETS_AFTER_MATCH_END: "המשחק הוכרע כבר במערכה הקודמת",
};

export function clampScore(sport: string, n: number): number {
  const max = (MAX_TEAM_SCORE as Record<string, number>)[sport] ?? 99;
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(max, Math.trunc(n)));
}

/** Live mirror of the server's soft warning: a side's players' goals/points exceed its score. */
export function liveWarnings(sport: string, form: EditorFormState): Array<{ sideOrder: 0 | 1; key: string; sum: number; teamScore: number }> {
  if (sport === "TENNIS") return [];
  const out: Array<{ sideOrder: 0 | 1; key: string; sum: number; teamScore: number }> = [];
  ([0, 1] as const).forEach((order) => {
    const stats = Object.values(form.players).filter((p) => p.sideOrder === order).map((p) => p.values);
    for (const w of checkPlayerTotals(sport, form.scores[order], stats)) {
      out.push({ sideOrder: order, key: w.key, sum: w.sum, teamScore: w.teamScore });
    }
  });
  return out;
}

export function isFormValid(sport: string, form: EditorFormState): boolean {
  if (!form.labels[0].trim() || !form.labels[1].trim()) return false;
  if (sport === "TENNIS") return tennisErrors(form.sets).winner !== null;
  return true;
}

export function buildSaveInput(sport: string, form: EditorFormState): SaveGameResultInput {
  const side = (i: 0 | 1) => ({
    label: form.labels[i].trim().slice(0, SIDE_LABEL_MAX),
    teamId: form.teamIds[i],
    ...(sport === "TENNIS" ? {} : { score: form.scores[i] }),
  });
  const sides: SaveGameResultInput["sides"] = [side(0), side(1)];
  if (sport === "TENNIS") sides[0].sets = form.sets;
  const stats = Object.entries(form.players)
    .map(([userId, p]) => {
      const cleaned = validateStats(sport, p.values).stats as StatValues;
      const values: StatValues = {};
      for (const d of getStatDefs(sport)) if ((cleaned[d.key] ?? 0) > 0) values[d.key] = cleaned[d.key];
      return { userId, sideOrder: p.sideOrder, values };
    })
    .filter((p) => p.sideOrder !== null || Object.keys(p.values).length > 0);
  const notes = form.notes.trim().slice(0, NOTES_MAX);
  return { sides, stats, notes: notes || null, ...(sport === "TENNIS" ? { bestOf: 3 as const } : {}) };
}

export function isDirty(a: EditorFormState, b: EditorFormState): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}
