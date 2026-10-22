import { getStatDefs, validateStats, validateTennisSets, MAX_TEAM_SCORE } from '@joinup/shared/matchStats';
import type {
    ScheduleConflict,
    ScheduleConflictType,
    ScheduleGenerateInput,
    StandingsRow,
    TournamentDetail,
    TournamentMatch,
    TournamentStatus,
    TournamentTeam,
} from '@/types/tournament';
import type { SubmitResultInput } from '@/hooks/tournaments/mutations';

// Pure logic for the manage console and score entry (design spec D0 sections 11, 12). No React, no MUI.

// ---------------------------------------------------------------------------------------------
// Roster validity (spec 11.1)
// ---------------------------------------------------------------------------------------------

export type RosterValidity = { state: 'ok' } | { state: 'missing'; n: number } | { state: 'over'; n: number };

export function acceptedCount(team: Pick<TournamentTeam, 'members'>): number {
    return (team.members ?? []).filter((m) => m.status === 'ACCEPTED').length;
}

export function rosterValidity(accepted: number, min: number, max: number): RosterValidity {
    if (accepted < min) return { state: 'missing', n: min - accepted };
    if (accepted > max) return { state: 'over', n: accepted - max };
    return { state: 'ok' };
}

export function rosterValidityLabel(v: RosterValidity): string {
    if (v.state === 'ok') return 'תקינה';
    if (v.state === 'missing') return `חסרים ${v.n}`;
    return `${v.n} מעל המקסימום`;
}

export type QueueSegment = 'PENDING' | 'APPROVED' | 'WAITLISTED' | 'OTHER';

export function queueSegment(status: TournamentTeam['status']): QueueSegment {
    if (status === 'PENDING' || status === 'APPROVED' || status === 'WAITLISTED') return status;
    return 'OTHER';
}

export function groupTeamsBySegment(teams: ReadonlyArray<TournamentTeam>): Record<QueueSegment, TournamentTeam[]> {
    const out: Record<QueueSegment, TournamentTeam[]> = { PENDING: [], APPROVED: [], WAITLISTED: [], OTHER: [] };
    for (const t of teams) out[queueSegment(t.status)].push(t);
    out.APPROVED.sort((a, b) => (a.seed ?? 1e9) - (b.seed ?? 1e9) || a.name.localeCompare(b.name));
    return out;
}

/** Hebrew copy for a team decision failure, or null for unknown codes. */
export function decisionErrorText(code: string | null | undefined, minPlayers: number): string | null {
    if (code === 'ROSTER_INVALID') return `אי אפשר לאשר קבוצה עם פחות מ-${minPlayers} שחקנים`;
    if (code === 'TOURNAMENT_FULL') return 'הטורניר מלא. העבירו קבוצה לרשימת ההמתנה או הגדילו את מספר הקבוצות.';
    return null;
}

// ---------------------------------------------------------------------------------------------
// Reordering: seeding and manual rank (spec 11.1)
// ---------------------------------------------------------------------------------------------

export function moveItem<T>(list: ReadonlyArray<T>, from: number, to: number): T[] {
    const out = [...list];
    if (from < 0 || from >= out.length) return out;
    const clamped = Math.max(0, Math.min(out.length - 1, to));
    const [item] = out.splice(from, 1);
    out.splice(clamped, 0, item);
    return out;
}

/** Fisher-Yates with an injectable rng so tests are deterministic. */
export function shuffled<T>(list: ReadonlyArray<T>, rng: () => number = Math.random): T[] {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

/** `[{ teamId, seed }]` for the teams whose seed actually changes (seeds are 1-based). */
export function seedPatches(
    order: ReadonlyArray<string>,
    current: ReadonlyArray<Pick<TournamentTeam, 'id' | 'seed'>>
): Array<{ teamId: string; seed: number }> {
    const cur = new Map(current.map((t) => [t.id, t.seed ?? null]));
    const out: Array<{ teamId: string; seed: number }> = [];
    order.forEach((teamId, i) => {
        if (cur.get(teamId) !== i + 1) out.push({ teamId, seed: i + 1 });
    });
    return out;
}

/** Teams tied in a standings table, in their current order. */
export function tiedRows(rows: ReadonlyArray<StandingsRow>): StandingsRow[] {
    return rows.filter((r) => r.tied);
}

/** Tied teams occupy ranks base..base+k-1; the chosen order assigns manualRank 1-based from the best tied rank. */
export function manualRankPatches(
    tied: ReadonlyArray<Pick<StandingsRow, 'rank'>>,
    order: ReadonlyArray<string>
): Array<{ teamId: string; manualRank: number }> {
    const base = tied.length ? Math.min(...tied.map((r) => r.rank)) : 1;
    return order.map((teamId, i) => ({ teamId, manualRank: base + i }));
}

// ---------------------------------------------------------------------------------------------
// Israel time (the API takes Asia/Jerusalem wall-clock times for generation; spec 11.2)
// ---------------------------------------------------------------------------------------------

const TZ = 'Asia/Jerusalem';

const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
});

export function isoToIsraelParts(iso: string): { date: string; time: string } | null {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const p: Record<string, string> = {};
    for (const part of dtf.formatToParts(d)) p[part.type] = part.value;
    return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** Wall-clock Israel date + `HH:mm` -> UTC ISO string, DST aware. `null` when the input is malformed. */
export function israelToIso(date: string, time: string): string | null {
    const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    const tm = /^(\d{2}):(\d{2})$/.exec(time);
    if (!dm || !tm) return null;
    const asUtc = Date.UTC(+dm[1], +dm[2] - 1, +dm[3], +tm[1], +tm[2]);
    // Israel is UTC+2/+3: try both offsets and keep the one that round-trips.
    for (const offsetH of [2, 3]) {
        const guess = new Date(asUtc - offsetH * 3600_000);
        const back = isoToIsraelParts(guess.toISOString());
        if (back && back.date === date && back.time === time) return guess.toISOString();
    }
    return null;
}

export function timeToMinutes(hhmm: string): number | null {
    const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
    if (!m) return null;
    const h = +m[1];
    const min = +m[2];
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
}

export function minutesToTime(total: number): string {
    const t = ((total % 1440) + 1440) % 1440;
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------------------------
// Schedule builder parameters (spec 11.2)
// ---------------------------------------------------------------------------------------------

export interface ScheduleDayParam {
    date: string;
    from: string;
    to: string;
}

export interface ScheduleParams {
    days: ScheduleDayParam[];
    /** Court count, or names when `namedCourts`. */
    courtCount: number;
    namedCourts: boolean;
    courtNames: string[];
    matchMinutes: number;
    breakMinutes: number;
    minRestMinutes: number;
    stepMinutes?: number;
    seed?: number;
}

export type ScheduleParamError =
    | { code: 'NO_DAYS' }
    | { code: 'DAY_DATE'; index: number }
    | { code: 'DAY_RANGE'; index: number }
    | { code: 'DAY_DUPLICATE'; index: number }
    | { code: 'COURTS' }
    | { code: 'COURT_NAMES' }
    | { code: 'MINUTES' };

export const MAX_COURTS = 20;

export function validateScheduleParams(p: ScheduleParams): ScheduleParamError[] {
    const errors: ScheduleParamError[] = [];
    if (p.days.length === 0) errors.push({ code: 'NO_DAYS' });
    const seen = new Set<string>();
    p.days.forEach((d, index) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) errors.push({ code: 'DAY_DATE', index });
        else if (seen.has(d.date)) errors.push({ code: 'DAY_DUPLICATE', index });
        else seen.add(d.date);
        const a = timeToMinutes(d.from);
        const b = timeToMinutes(d.to);
        if (a === null || b === null || b <= a) errors.push({ code: 'DAY_RANGE', index });
    });
    if (p.namedCourts) {
        const names = p.courtNames.map((n) => n.trim()).filter(Boolean);
        if (names.length === 0 || names.length > MAX_COURTS || new Set(names).size !== names.length) errors.push({ code: 'COURT_NAMES' });
    } else if (!Number.isInteger(p.courtCount) || p.courtCount < 1 || p.courtCount > MAX_COURTS) {
        errors.push({ code: 'COURTS' });
    }
    if (!(p.matchMinutes >= 1) || p.breakMinutes < 0 || p.minRestMinutes < 0) errors.push({ code: 'MINUTES' });
    return errors;
}

export const SCHEDULE_PARAM_ERROR_HE: Record<ScheduleParamError['code'], string> = {
    NO_DAYS: 'הוסיפו לפחות יום אחד',
    DAY_DATE: 'בחרו תאריך',
    DAY_RANGE: 'שעת הסיום צריכה להיות אחרי שעת ההתחלה',
    DAY_DUPLICATE: 'התאריך הזה כבר ברשימה',
    COURTS: `מספר המגרשים צריך להיות בין 1 ל-${MAX_COURTS}`,
    COURT_NAMES: 'שמות המגרשים צריכים להיות ייחודיים (עד 20)',
    MINUTES: 'משך המשחק צריך להיות חיובי',
};

export function buildGenerateInput(p: ScheduleParams, opts: { allowConflicts?: boolean } = {}): ScheduleGenerateInput {
    const courts = p.namedCourts ? p.courtNames.map((n) => n.trim()).filter(Boolean) : p.courtCount;
    return {
        ...(p.seed !== undefined ? { seed: p.seed } : {}),
        ...(opts.allowConflicts ? { allowConflicts: true } : {}),
        schedule: {
            days: p.days.map((d) => ({ date: d.date, from: d.from, to: d.to })),
            courts,
            matchMinutes: p.matchMinutes,
            breakMinutes: p.breakMinutes,
            minRestMinutes: p.minRestMinutes,
            ...(p.stepMinutes ? { stepMinutes: p.stepMinutes } : {}),
        },
    };
}

// ---------------------------------------------------------------------------------------------
// Conflicts (spec 11.2): plain-language grouping, never the server's English message
// ---------------------------------------------------------------------------------------------

export interface ConflictContext {
    /** match id or preview key -> match number. */
    numberById: ReadonlyMap<string, number>;
    teamNameById: ReadonlyMap<string, string>;
    minRestMinutes?: number;
}

export interface DescribedConflict {
    type: ScheduleConflictType;
    title: string;
    body: string;
    /** Ids or preview keys, as the server returned them. */
    matchIds: string[];
    numbers: number[];
}

export const CONFLICT_TITLE_HE: Record<ScheduleConflictType, string> = {
    COURT_OVERLAP: 'שני משחקים באותו מגרש באותה שעה',
    TEAM_OVERLAP: 'קבוצה בשני משחקים במקביל',
    TEAM_REST: 'אין מספיק מנוחה',
    OUTSIDE_WINDOW: 'מחוץ לשעות שהוגדרו',
    NO_SLOT: 'אין זמן פנוי',
    DEPENDENCY_UNSCHEDULED: 'משחק תלוי לא שובץ',
};

/** Stable display order: structural problems first. */
export const CONFLICT_ORDER: ScheduleConflictType[] = [
    'NO_SLOT',
    'DEPENDENCY_UNSCHEDULED',
    'COURT_OVERLAP',
    'TEAM_OVERLAP',
    'TEAM_REST',
    'OUTSIDE_WINDOW',
];

function conflictIds(c: ScheduleConflict): string[] {
    const ids = (c as { matchIds?: unknown }).matchIds;
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [];
}

export function describeConflict(c: ScheduleConflict, ctx: ConflictContext): DescribedConflict {
    const ids = conflictIds(c);
    const numbers = ids.map((id) => ctx.numberById.get(id)).filter((n): n is number => typeof n === 'number');
    const a = numbers[0] !== undefined ? `#${numbers[0]}` : '';
    const b = numbers[1] !== undefined ? `#${numbers[1]}` : '';
    const teamId = typeof c.teamId === 'string' ? c.teamId : undefined;
    const team = (teamId && ctx.teamNameById.get(teamId)) || 'קבוצה';
    const court = typeof c.court === 'string' && c.court ? c.court : typeof c.court === 'number' ? `מגרש ${c.court}` : 'אותו מגרש';
    let body: string;
    switch (c.type) {
        case 'COURT_OVERLAP':
            body = `משחקים ${a} ו-${b} מתנגשים ב${court}. הוסיפו מגרש או זמן.`;
            break;
        case 'TEAM_OVERLAP':
            body = `${team} משובצת ב-${a} וב-${b} באותו זמן.`;
            break;
        case 'TEAM_REST':
            body = `ל${team} יש פחות מ-${ctx.minRestMinutes ?? 0} דק׳ בין ${a} ל-${b}.`;
            break;
        case 'OUTSIDE_WINDOW':
            body = `משחק ${a} לא נכנס לאף חלון זמן.`;
            break;
        case 'NO_SLOT':
            body = `לא נמצא מגרש פנוי למשחק ${a}. הוסיפו יום, שעות או מגרשים.`;
            break;
        case 'DEPENDENCY_UNSCHEDULED':
            body = `${a} תלוי בתוצאה של משחק שעוד לא שובץ, ולכן לא שובץ גם הוא.`;
            break;
        default:
            body = 'יש התנגשות בלוח המשחקים.';
    }
    return { type: c.type, title: CONFLICT_TITLE_HE[c.type] ?? 'התנגשות', body, matchIds: ids, numbers };
}

export interface ConflictGroups {
    items: DescribedConflict[];
    countByType: Partial<Record<ScheduleConflictType, number>>;
    /** Every match id / key that appears in some conflict (drives the block warning border). */
    conflictedIds: Set<string>;
    total: number;
}

/** Describe and sort conflicts by `CONFLICT_ORDER`, count per type and collect the affected match ids. */
export function groupConflicts(conflicts: ReadonlyArray<ScheduleConflict>, ctx: ConflictContext): ConflictGroups {
    const items = conflicts.map((c) => describeConflict(c, ctx));
    items.sort((x, y) => CONFLICT_ORDER.indexOf(x.type) - CONFLICT_ORDER.indexOf(y.type));
    const countByType: ConflictGroups['countByType'] = {};
    const conflictedIds = new Set<string>();
    for (const it of items) {
        countByType[it.type] = (countByType[it.type] ?? 0) + 1;
        for (const id of it.matchIds) conflictedIds.add(id);
    }
    return { items, countByType, conflictedIds, total: items.length };
}

// ---------------------------------------------------------------------------------------------
// Status controls (spec 11.3)
// ---------------------------------------------------------------------------------------------

export interface StatusAction {
    to: TournamentStatus;
    label: string;
    confirm: string;
    /** Opening a past stage again. */
    reopen?: boolean;
}

export const STATUS_ORDER: TournamentStatus[] = ['DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'IN_PROGRESS', 'COMPLETED'];

export function nextStatusAction(status: TournamentStatus): StatusAction | null {
    switch (status) {
        case 'DRAFT':
            return { to: 'REGISTRATION_OPEN', label: 'פרסום ופתיחת הרשמה', confirm: 'הטורניר יפורסם וקבוצות יוכלו להירשם.' };
        case 'REGISTRATION_OPEN':
            return {
                to: 'REGISTRATION_CLOSED',
                label: 'סגירת הרשמה',
                confirm:
                    'קבוצות חדשות לא יוכלו להירשם, והקישורים להצטרפות יפסיקו לעבוד. אפשר לפתוח מחדש כל עוד לא נבנה לוח משחקים.',
            };
        case 'REGISTRATION_CLOSED':
            return {
                to: 'IN_PROGRESS',
                label: 'התחלת הטורניר',
                confirm: 'אחרי ההתחלה אפשר להזין תוצאות, ואי אפשר לפתוח הרשמה מחדש.',
            };
        case 'IN_PROGRESS':
            return {
                to: 'COMPLETED',
                label: 'סיום הטורניר',
                confirm: 'הטורניר יסומן כהסתיים והאלופה תוצג בעמוד. משחקים שלא שוחקו יישארו כפי שהם.',
            };
        default:
            return null;
    }
}

/** "Reopen registration" exists only from REGISTRATION_CLOSED and only before a schedule exists. */
export function reopenAction(status: TournamentStatus, hasSchedule: boolean, closesAt?: string | null): StatusAction | null {
    if (status !== 'REGISTRATION_CLOSED' || hasSchedule) return null;
    const date = closesAt ? new Date(closesAt).toLocaleDateString('he-IL') : '';
    return {
        to: 'REGISTRATION_OPEN',
        label: 'פתיחת ההרשמה מחדש',
        confirm: date ? `ההרשמה תיפתח שוב עד ${date}.` : 'ההרשמה תיפתח שוב.',
        reopen: true,
    };
}

export function canCancelTournament(status: TournamentStatus): boolean {
    return status !== 'COMPLETED' && status !== 'CANCELLED';
}

/** Type-to-confirm for cancel: trimmed, case-insensitive. */
export function cancelConfirmMatches(typed: string, title: string): boolean {
    return typed.trim().length > 0 && typed.trim().toLowerCase() === title.trim().toLowerCase();
}

export interface StartProblem {
    code: string;
    approved?: number;
    minTeams?: number;
    teamId?: string;
    players?: number;
}

export interface StartProblemView {
    code: 'TOO_FEW_TEAMS' | 'TOO_FEW_PLAYERS' | 'TOO_MANY_PLAYERS' | 'NO_SCHEDULE' | 'OTHER';
    text: string;
    teamId?: string;
}

export function describeStartProblem(
    raw: unknown,
    t: Pick<TournamentDetail, 'minPlayersPerTeam' | 'maxPlayersPerTeam'>,
    teamNameById: ReadonlyMap<string, string>
): StartProblemView {
    const p = (raw ?? {}) as StartProblem;
    switch (p.code) {
        case 'TOO_FEW_TEAMS':
            return { code: 'TOO_FEW_TEAMS', text: `רק ${p.approved ?? 0} קבוצות מאושרות, צריך לפחות ${p.minTeams ?? 0}` };
        case 'TOO_FEW_PLAYERS':
        case 'TOO_MANY_PLAYERS':
            return {
                code: p.code,
                teamId: p.teamId,
                text: `${(p.teamId && teamNameById.get(p.teamId)) || 'קבוצה'}: ${p.players ?? 0} שחקנים (צריך ${t.minPlayersPerTeam}–${t.maxPlayersPerTeam})`,
            };
        case 'NO_SCHEDULE':
            return { code: 'NO_SCHEDULE', text: 'עוד לא נבנה לוח משחקים' };
        default:
            return { code: 'OTHER', text: 'בעיה לא ידועה' };
    }
}

// ---------------------------------------------------------------------------------------------
// Score entry (spec 12)
// ---------------------------------------------------------------------------------------------

export type ScoreStatus = 'LIVE' | 'FINISHED' | 'FORFEIT';
export type StatsForm = Record<string, Record<string, number>>;

export interface ScoreForm {
    status: ScoreStatus;
    home: number;
    away: number;
    penHome: number;
    penAway: number;
    sets: Array<[number, number]>;
    /** Team id that forfeits. */
    forfeitBy: string | null;
    stats: StatsForm;
}

export const MAX_SETS = 5;

export function maxScoreFor(sport: string): number {
    return (MAX_TEAM_SCORE as Record<string, number>)[sport] ?? 99;
}

export function clampScore(sport: string, n: number): number {
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(maxScoreFor(sport), Math.trunc(n)));
}

export function bestOfFor(t: Pick<TournamentDetail, 'rules'>, match?: Pick<TournamentMatch, 'details'> | null): 3 | 5 {
    const fromMatch = match?.details?.bestOf;
    if (fromMatch === 3 || fromMatch === 5) return fromMatch;
    return t.rules?.bestOf === 5 ? 5 : 3;
}

export function initScoreForm(match: TournamentMatch, sport: string): ScoreForm {
    const status: ScoreStatus = match.status === 'LIVE' ? 'LIVE' : match.status === 'FORFEIT' ? 'FORFEIT' : 'FINISHED';
    const sets = (match.details?.sets ?? []).map(([a, b]) => [a, b] as [number, number]);
    const forfeitBy =
        match.status === 'FORFEIT' && match.winnerTeamId
            ? match.winnerTeamId === match.home.teamId
                ? match.away.teamId
                : match.home.teamId
            : null;
    return {
        status,
        home: match.homeScore ?? 0,
        away: match.awayScore ?? 0,
        penHome: match.homePenalties ?? 0,
        penAway: match.awayPenalties ?? 0,
        sets: sport === 'TENNIS' ? (sets.length ? sets : [[0, 0]]) : [],
        forfeitBy,
        stats: {},
    };
}

/** Group-stage matches carry a groupId; league and custom stages never need penalties up front. */
export function isKnockoutMatch(t: Pick<TournamentDetail, 'format'>, m: Pick<TournamentMatch, 'groupId'>): boolean {
    if (t.format === 'KNOCKOUT') return true;
    if (t.format === 'GROUPS_KNOCKOUT') return m.groupId == null;
    return false;
}

export function tennisCheck(sets: Array<[number, number]>, bestOf: number) {
    const r = validateTennisSets(sets, { bestOf: bestOf as 3 | 5 });
    const rows: Record<number, string> = {};
    let match: string | null = null;
    for (const e of r.errors) {
        if (typeof e.index === 'number') rows[e.index] = e.code;
        else match = e.code;
    }
    return { rows, match, winner: r.valid ? (r.winner as 0 | 1) : null, setsWon: [r.setsWon[0], r.setsWon[1]] as [number, number] };
}

export function needsPenalties(form: ScoreForm, sport: string, knockout: boolean, forceShow = false): boolean {
    if (form.status !== 'FINISHED' || sport === 'TENNIS') return false;
    return (knockout && form.home === form.away) || forceShow;
}

export type ScoreFormError = 'FORFEIT_TEAM' | 'PENALTIES' | 'TENNIS_SETS' | 'TEAMS_UNKNOWN';

export interface ScoreFormCtx {
    sport: string;
    bestOf: number;
    knockout: boolean;
    homeTeamId: string | null;
    awayTeamId: string | null;
    penaltiesShown: boolean;
}

export function validateScoreForm(form: ScoreForm, ctx: ScoreFormCtx): ScoreFormError[] {
    const errors: ScoreFormError[] = [];
    if (!ctx.homeTeamId || !ctx.awayTeamId) errors.push('TEAMS_UNKNOWN');
    if (form.status === 'FORFEIT') {
        if (!form.forfeitBy || (form.forfeitBy !== ctx.homeTeamId && form.forfeitBy !== ctx.awayTeamId)) errors.push('FORFEIT_TEAM');
        return errors;
    }
    if (ctx.sport === 'TENNIS') {
        if (form.status === 'FINISHED' && tennisCheck(form.sets, ctx.bestOf).winner === null) errors.push('TENNIS_SETS');
        return errors;
    }
    if (form.status === 'FINISHED' && ctx.penaltiesShown && form.penHome === form.penAway && form.home === form.away) {
        errors.push('PENALTIES');
    }
    return errors;
}

export const SCORE_ERROR_HE: Record<ScoreFormError, string> = {
    FORFEIT_TEAM: 'בחרו מי הפסידה טכנית',
    PENALTIES: 'הפנדלים חייבים להיות שונים כדי לקבוע מי עולה',
    TENNIS_SETS: 'תוצאת המערכות לא תקינה או שהמשחק עוד לא הוכרע',
    TEAMS_UNKNOWN: 'הקבוצות במשחק הזה עוד לא נקבעו',
};

/** Strip zero values and unknown keys, drop players with nothing left. */
export function cleanStats(sport: string, stats: StatsForm): StatsForm {
    const keys = new Set(getStatDefs(sport).map((d) => d.key));
    const out: StatsForm = {};
    for (const [userId, values] of Object.entries(stats)) {
        const cleaned = validateStats(sport, values).stats as Record<string, number>;
        const kept: Record<string, number> = {};
        for (const [k, v] of Object.entries(cleaned)) if (keys.has(k) && v > 0) kept[k] = v;
        if (Object.keys(kept).length) out[userId] = kept;
    }
    return out;
}

export function buildResultInput(form: ScoreForm, ctx: ScoreFormCtx): SubmitResultInput {
    if (form.status === 'FORFEIT') {
        return { status: 'FORFEIT', forfeitBy: form.forfeitBy ?? undefined };
    }
    if (ctx.sport === 'TENNIS') {
        if (form.status === 'LIVE') return { status: 'LIVE' };
        return { status: 'FINISHED', details: { sets: form.sets } };
    }
    const base: SubmitResultInput = { status: form.status, homeScore: form.home, awayScore: form.away };
    if (form.status === 'FINISHED') {
        if (ctx.penaltiesShown && form.home === form.away) base.penalties = { home: form.penHome, away: form.penAway };
        const stats = cleanStats(ctx.sport, form.stats);
        if (Object.keys(stats).length) base.stats = stats;
    }
    return base;
}

/** True when anything differs from the form loaded for this match (guards the close confirm). */
export function scoreFormDirty(a: ScoreForm, b: ScoreForm): boolean {
    return JSON.stringify(a) !== JSON.stringify(b);
}

export function saveLabel(status: ScoreStatus): string {
    if (status === 'LIVE') return 'עדכון תוצאה חיה';
    if (status === 'FORFEIT') return 'שמירת ניצחון טכני';
    return 'שמירה וסיום משחק';
}

/** Who advanced because of this save: first changed match other than this one. Used for the Snackbar copy. */
export function downstreamIds(changedMatchIds: ReadonlyArray<string>, matchId: string): string[] {
    return changedMatchIds.filter((id) => id !== matchId);
}

/** Hebrew copy for a score save failure that is not handled by its own card, or null. */
export function scoreErrorText(code: string | null | undefined): string | null {
    switch (code) {
        case 'TEAMS_UNKNOWN':
            return 'הקבוצות במשחק הזה עוד לא נקבעו';
        case 'NOT_IN_PROGRESS':
            return 'אפשר להזין תוצאות רק כשהטורניר מתקיים';
        case 'INVALID_RESULT':
        case 'INVALID_SCORES':
        case 'INVALID_STATS':
        case 'INVALID_PENALTIES':
            return 'התוצאה לא תקינה. בדקו את השדות המסומנים.';
        default:
            return null;
    }
}
