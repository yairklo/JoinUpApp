import type {
    BracketStage,
    StandingsTable,
    TeamRef,
    Tournament,
    TournamentFilters,
    TournamentMatch,
    TournamentStatus,
} from '@/types/tournament';
import { dayKey, ltrIsolate, type Lang } from './matchFormat';

const TZ = 'Asia/Jerusalem';
const loc = (lang: Lang) => (lang === 'he' ? 'he-IL' : 'en-US');

function fmt(iso: string, lang: Lang, opts: Intl.DateTimeFormatOptions): string {
    try {
        return new Date(iso).toLocaleDateString(loc(lang), { ...opts, timeZone: TZ });
    } catch {
        return dayKey(iso);
    }
}

/** "12/11" */
export const fmtShortDate = (iso: string, lang: Lang) => fmt(iso, lang, { day: 'numeric', month: 'numeric' });

/**
 * Registration window copy. Omits a missing bound instead of printing a placeholder dash
 * ("ההרשמה: – – 24.10"). Dates are LTR-isolated so "24.10" is not reordered.
 */
export function registrationWindowCopy(
    opensAt: string | null | undefined,
    closesAt: string | null | undefined,
    lang: Lang,
): { key: string; values: Record<string, string> } | null {
    const from = opensAt ? fmtShortDate(opensAt, lang) : '';
    const to = closesAt ? fmtShortDate(closesAt, lang) : '';
    if (from && to) return { key: 'tournaments.overview.registrationWindow', values: { range: ltrIsolate(`${from} – ${to}`) } };
    if (to) return { key: 'tournaments.overview.registrationUntil', values: { date: ltrIsolate(to) } };
    if (from) return { key: 'tournaments.overview.registrationFrom', values: { date: ltrIsolate(from) } };
    return null;
}

/** "12–14/11" for a range within one month, "12/11–2/12" otherwise, a single date when there is no end. */
export function fmtDateRange(startsAt: string, endsAt: string | null | undefined, lang: Lang): string {
    const a = fmtShortDate(startsAt, lang);
    if (!endsAt || dayKey(endsAt) === dayKey(startsAt)) return a;
    const b = fmtShortDate(endsAt, lang);
    const [ad, am] = a.split('/');
    const [bd, bm] = b.split('/');
    if (am && am === bm) return `${ad}–${bd}/${am}`;
    return `${a}–${b}`;
}

export type StatusFilterKey = 'all' | 'open' | 'live' | 'done';

export const STATUS_FILTERS: { key: StatusFilterKey; statuses?: TournamentStatus[]; label: string }[] = [
    { key: 'all', label: 'tournaments.all' },
    { key: 'open', statuses: ['REGISTRATION_OPEN'], label: 'tournaments.sectionOpen' },
    { key: 'live', statuses: ['REGISTRATION_CLOSED', 'IN_PROGRESS'], label: 'tournaments.sectionLive' },
    { key: 'done', statuses: ['COMPLETED'], label: 'tournaments.sectionDone' },
];

export function toListFilters(status: StatusFilterKey, sport: string | null, mine: boolean): TournamentFilters {
    const f: TournamentFilters = { limit: 50 };
    const statuses = STATUS_FILTERS.find((s) => s.key === status)?.statuses;
    if (statuses) f.status = statuses.length === 1 ? statuses[0] : statuses;
    if (sport) f.sport = sport as TournamentFilters['sport'];
    if (mine) f.mine = true;
    return f;
}

export type SectionKey = 'drafts' | 'open' | 'live' | 'done';

/** Sections of the unfiltered list (spec 1.2): drafts first, empty ones are omitted by the caller. */
export function sectionOf(t: Pick<Tournament, 'status'>): SectionKey {
    if (t.status === 'DRAFT') return 'drafts';
    if (t.status === 'REGISTRATION_OPEN') return 'open';
    if (t.status === 'COMPLETED' || t.status === 'CANCELLED') return 'done';
    return 'live';
}

export interface Champion {
    champion: TeamRef;
    second?: TeamRef;
    third?: TeamRef;
}

const home = (m: TournamentMatch) => m.home.team;
const away = (m: TournamentMatch) => m.away.team;
const sideTeam = (m: TournamentMatch, id: string | null | undefined) =>
    id ? (home(m)?.id === id ? home(m) : away(m)?.id === id ? away(m) : null) : null;

/**
 * Champion and podium for a COMPLETED tournament (spec 2.4 / 19.1: derived on the client).
 * Knockout: winner of the last non-third-place match of the last knockout stage; third place from the
 * third-place match. League: rank 1..3 of a complete table. CUSTOM / unknown: `null` (no banner).
 */
export function deriveChampion(
    format: string,
    stages: BracketStage[],
    tables: StandingsTable[]
): Champion | null {
    if (format === 'KNOCKOUT' || format === 'GROUPS_KNOCKOUT') {
        const stage = stages[stages.length - 1];
        const round = stage?.rounds[stage.rounds.length - 1];
        const final = round?.matches.find((m) => !m.isThirdPlace) ?? null;
        if (!final || !final.winnerTeamId) return null;
        const champion = sideTeam(final, final.winnerTeamId);
        if (!champion) return null;
        const loserId = home(final)?.id === champion.id ? away(final)?.id : home(final)?.id;
        const second = sideTeam(final, loserId) ?? undefined;
        const tp = round?.matches.find((m) => m.isThirdPlace);
        const third = tp ? sideTeam(tp, tp.winnerTeamId) ?? undefined : undefined;
        return { champion, second, third };
    }
    if (format === 'LEAGUE') {
        const table = tables.find((t) => t.complete && t.rows.length > 0);
        if (!table) return null;
        const [r1, r2, r3] = table.rows;
        return { champion: r1.team, second: r2?.team, third: r3?.team };
    }
    return null;
}

export function capacityPct(approved: number | undefined, max: number): number {
    if (!max || !approved) return 0;
    return Math.min(100, Math.round((approved / max) * 100));
}
