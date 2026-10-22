import type {
    BracketRound,
    LeaderRow,
    MatchStatus,
    StandingsRow,
    TournamentMatch,
    TournamentStage,
} from '@/types/tournament';

// Pure helpers for the schedule / standings / bracket / leaders views (design spec D0 sections 7-9, 13).

const TZ = 'Asia/Jerusalem';

/** yyyy-mm-dd of an instant in Israel time (stable day key for grouping). */
export function dayKey(iso: string): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

/** "18:30" in Israel time. */
export function timeLabel(iso: string): string {
    return new Intl.DateTimeFormat('he-IL', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

/** "שישי 12/11" for day chips. */
export function dayChipLabel(key: string): string {
    const d = new Date(`${key}T12:00:00Z`);
    const wd = new Intl.DateTimeFormat('he-IL', { timeZone: 'UTC', weekday: 'long' }).format(d);
    const [, m, day] = key.split('-');
    return `${wd} ${Number(day)}/${Number(m)}`;
}

/** "יום שישי, 12 בנובמבר" for group headers. */
export function dayHeaderLabel(key: string): string {
    const d = new Date(`${key}T12:00:00Z`);
    return new Intl.DateTimeFormat('he-IL', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(d);
}

export type StatusFilter = 'ALL' | 'LIVE' | 'UPCOMING' | 'DONE';

const DONE: MatchStatus[] = ['FINISHED', 'FORFEIT'];

export interface ScheduleFilterState {
    day: string | 'ALL';
    teamId: string | null;
    status: StatusFilter;
    stageId: string | null;
}

export function filterMatches(matches: readonly TournamentMatch[], f: ScheduleFilterState): TournamentMatch[] {
    return matches.filter((m) => {
        if (f.day !== 'ALL' && (!m.scheduledAt || dayKey(m.scheduledAt) !== f.day)) return false;
        if (f.teamId && m.home.teamId !== f.teamId && m.away.teamId !== f.teamId) return false;
        if (f.stageId && m.stageId !== f.stageId) return false;
        if (f.status === 'LIVE' && m.status !== 'LIVE') return false;
        if (f.status === 'UPCOMING' && m.status !== 'SCHEDULED' && m.status !== 'POSTPONED') return false;
        if (f.status === 'DONE' && !DONE.includes(m.status)) return false;
        return true;
    });
}

/** Match days present in the schedule, sorted. */
export function matchDays(matches: readonly TournamentMatch[]): string[] {
    const s = new Set<string>();
    for (const m of matches) if (m.scheduledAt) s.add(dayKey(m.scheduledAt));
    return [...s].sort();
}

/** Default day: today when it is a match day, else the first upcoming day, else the last day, else ALL. */
export function defaultDay(days: readonly string[], now: Date = new Date()): string | 'ALL' {
    if (days.length === 0) return 'ALL';
    const today = dayKey(now.toISOString());
    if (days.includes(today)) return today;
    return days.find((d) => d > today) ?? days[days.length - 1];
}

export function compareMatches(a: TournamentMatch, b: TournamentMatch): number {
    const ta = a.scheduledAt ? Date.parse(a.scheduledAt) : Infinity;
    const tb = b.scheduledAt ? Date.parse(b.scheduledAt) : Infinity;
    return ta - tb || a.number - b.number;
}

export interface MatchGroup {
    key: string;
    title: string;
    matches: TournamentMatch[];
}

/**
 * Groups by day when the matches span more than one day (or all have a time on different days), otherwise by
 * stage + round (spec 7.1). Unscheduled matches go in a trailing group.
 */
export function groupMatches(matches: readonly TournamentMatch[], stages: readonly TournamentStage[] = []): MatchGroup[] {
    const sorted = [...matches].sort(compareMatches);
    const days = matchDays(sorted);
    if (days.length > 1) {
        const groups: MatchGroup[] = days.map((d) => ({ key: d, title: dayHeaderLabel(d), matches: [] }));
        const idx = new Map(days.map((d, i) => [d, i]));
        const rest: TournamentMatch[] = [];
        for (const m of sorted) {
            if (m.scheduledAt) groups[idx.get(dayKey(m.scheduledAt)) as number].matches.push(m);
            else rest.push(m);
        }
        if (rest.length) groups.push({ key: 'unscheduled', title: 'ללא מועד', matches: rest });
        return groups;
    }
    const stageName = new Map(stages.map((s) => [s.id, s.name]));
    const groupName = new Map(stages.flatMap((s) => s.groups.map((g) => [g.id, g.name] as const)));
    const out = new Map<string, MatchGroup>();
    for (const m of sorted) {
        const stage = m.stageId ? stageName.get(m.stageId) : undefined;
        const grp = m.groupId ? groupName.get(m.groupId) : undefined;
        const round = m.round != null ? `מחזור ${m.round}` : '';
        const title = [grp ? `בית ${grp}` : stage, round].filter(Boolean).join(' · ') || 'משחקים';
        const key = `${m.stageId ?? ''}|${m.groupId ?? ''}|${m.round ?? ''}`;
        if (!out.has(key)) out.set(key, { key, title, matches: [] });
        out.get(key)?.matches.push(m);
    }
    return [...out.values()];
}

/** Stage/round caption on a match card ("בית א׳ · מחזור 2"). */
export function stageCaption(m: TournamentMatch, stages: readonly TournamentStage[] = []): string {
    const stage = stages.find((s) => s.id === m.stageId);
    const grp = stage?.groups.find((g) => g.id === m.groupId);
    const round = m.round != null ? `מחזור ${m.round}` : '';
    return [grp ? `בית ${grp.name}` : stage?.name, round].filter(Boolean).join(' · ');
}

// ---- standings ----

const MINUS = '−';

/** Signed goal difference with a real minus: "+5", "−2", "0". */
export function formatGd(gd: number): string {
    if (gd > 0) return `+${gd}`;
    if (gd < 0) return `${MINUS}${Math.abs(gd)}`;
    return '0';
}

/** Rank label: "=4" for a tie, plain number otherwise. */
export function rankLabel(row: Pick<StandingsRow, 'rank' | 'tied'>): string {
    return row.tied ? `=${row.rank}` : String(row.rank);
}

/** Qualifier rows are those with rank <= advance (only when advance is a positive number). */
export function isQualifier(row: Pick<StandingsRow, 'rank'>, advance?: number | null): boolean {
    return !!advance && advance > 0 && row.rank <= advance;
}

// ---- bracket ----

const ROUND_NAMES: Record<string, string> = {
    FINAL: 'גמר',
    SEMI_FINAL: 'חצי גמר',
    QUARTER_FINAL: 'רבע גמר',
    ROUND_OF_16: 'שמינית גמר',
    ROUND_OF_32: 'שלב 32 האחרונות',
};

export function bracketRoundName(name: string): string {
    if (ROUND_NAMES[name]) return ROUND_NAMES[name];
    const m = /^ROUND_OF_(\d+)$/.exec(name);
    return m ? `שלב ${m[1]} האחרונות` : name;
}

/** Cell and gap sizes shared by the geometry helper and the view. */
export const BRACKET_CELL_H = 72;
export const BRACKET_GAP = 16;

/** Top offset of a cell in round `r` (1-based) so it centres between its feeders: (2^(r-1) - 1) * (h + gap) / 2. */
export function roundTopOffset(r: number, cellH = BRACKET_CELL_H, gap = BRACKET_GAP): number {
    return ((2 ** (r - 1) - 1) * (cellH + gap)) / 2;
}

/** Vertical distance between cell tops in round `r`: 2^(r-1) * (h + gap). */
export function roundStride(r: number, cellH = BRACKET_CELL_H, gap = BRACKET_GAP): number {
    return 2 ** (r - 1) * (cellH + gap);
}

/** Total canvas height for a bracket whose first round has `firstRoundMatches` cells. */
export function bracketHeight(firstRoundMatches: number, cellH = BRACKET_CELL_H, gap = BRACKET_GAP): number {
    return Math.max(1, firstRoundMatches) * (cellH + gap) - gap;
}

export interface BracketSplit {
    main: BracketRound[];
    thirdPlace: TournamentMatch | null;
}

/** Third-place match (isThirdPlace) is lifted out of its round so the main rounds form a clean tree. */
export function splitThirdPlace(rounds: readonly BracketRound[]): BracketSplit {
    let third: TournamentMatch | null = null;
    const main: BracketRound[] = [];
    for (const r of rounds) {
        const keep = r.matches.filter((m) => {
            if (m.isThirdPlace) {
                third = m;
                return false;
            }
            return true;
        });
        if (keep.length) main.push({ ...r, matches: keep });
    }
    return { main, thirdPlace: third };
}

/** A bye: exactly one slot has neither a team nor a source (the empty side will never be filled). */
export function isByeMatch(m: TournamentMatch): boolean {
    const empty = (s: TournamentMatch['home']) => !s.team && !s.source;
    return empty(m.home) !== empty(m.away);
}

/** Match ids on the path of `teamId` (every match the team has a slot in). */
export function teamPathIds(rounds: readonly BracketRound[], teamId: string | null | undefined): Set<string> {
    const ids = new Set<string>();
    if (!teamId) return ids;
    for (const r of rounds) for (const m of r.matches) if (m.home.teamId === teamId || m.away.teamId === teamId) ids.add(m.id);
    return ids;
}

/** Index of the round to show first: first with an unfinished match, else the last. */
export function currentRoundIndex(rounds: readonly BracketRound[]): number {
    const i = rounds.findIndex((r) => r.matches.some((m) => m.status !== 'FINISHED' && m.status !== 'FORFEIT' && m.status !== 'CANCELLED'));
    return i === -1 ? Math.max(0, rounds.length - 1) : i;
}

// ---- leaders ----

/** Position labels with "=" for shared values (spec 13). Input must be sorted by value descending. */
export function leaderPositions(rows: ReadonlyArray<Pick<LeaderRow, 'value'>>): string[] {
    const pos: number[] = [];
    rows.forEach((r, i) => pos.push(i > 0 && r.value === rows[i - 1].value ? pos[i - 1] : i + 1));
    return pos.map((p, i) => {
        const shared = (i > 0 && pos[i - 1] === p) || (i + 1 < pos.length && pos[i + 1] === p);
        return shared ? `=${p}` : String(p);
    });
}

// ---- calendar ----

const icsStamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

/** Minimal RFC 5545 calendar with one event per scheduled match (UTC times). Matches without a time are skipped. */
export function buildMatchesIcs(
    items: ReadonlyArray<{ id: string; scheduledAt: string | null; summary: string; location?: string | null }>,
    durationMinutes = 60
): string {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//JoinUp//Tournaments//HE', 'CALSCALE:GREGORIAN'];
    for (const it of items) {
        if (!it.scheduledAt) continue;
        const start = new Date(it.scheduledAt);
        const end = new Date(start.getTime() + durationMinutes * 60_000);
        lines.push(
            'BEGIN:VEVENT',
            `UID:${it.id}@joinup`,
            `DTSTAMP:${icsStamp(new Date(0))}`,
            `DTSTART:${icsStamp(start)}`,
            `DTEND:${icsStamp(end)}`,
            `SUMMARY:${icsEscape(it.summary)}`,
            ...(it.location ? [`LOCATION:${icsEscape(it.location)}`] : []),
            'END:VEVENT'
        );
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
}
