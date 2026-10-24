import type {
    MatchSlot,
    MatchStatus,
    TeamLite,
    TournamentMatch,
    TournamentStage,
    TournamentStatus,
} from '@/types/tournament';
import { displayGroupName } from '@/utils/tournamentViews';

// Pure helpers for the tournament UI: status tokens (design spec D0 sections 0.3, 0.4) and score/slot
// logic shared by the presentational components. No React, no MUI theme access.

export type TournamentLocale = 'he' | 'en';

/** MUI Chip props subset used by the status chips (spec 0.3). */
export interface ChipToken {
    label: { he: string; en: string };
    color: 'default' | 'success' | 'secondary' | 'error' | 'warning';
    variant: 'filled' | 'outlined';
    /** Extra affordance rendered by the chip component. */
    icon?: 'trophy' | 'liveDot';
}

export const TOURNAMENT_STATUS_TOKENS: Record<TournamentStatus, ChipToken> = {
    DRAFT: { label: { he: 'טיוטה', en: 'Draft' }, color: 'default', variant: 'outlined' },
    REGISTRATION_OPEN: { label: { he: 'הרשמה פתוחה', en: 'Registration open' }, color: 'success', variant: 'filled' },
    REGISTRATION_CLOSED: { label: { he: 'ההרשמה נסגרה', en: 'Registration closed' }, color: 'default', variant: 'filled' },
    IN_PROGRESS: { label: { he: 'מתקיים עכשיו', en: 'In progress' }, color: 'secondary', variant: 'filled' },
    COMPLETED: { label: { he: 'הסתיים', en: 'Finished' }, color: 'default', variant: 'filled', icon: 'trophy' },
    CANCELLED: { label: { he: 'בוטל', en: 'Cancelled' }, color: 'error', variant: 'outlined' },
};

/** `null` = no chip is shown (SCHEDULED shows the time, FINISHED shows the score). */
export const MATCH_STATUS_TOKENS: Record<MatchStatus, ChipToken | null> = {
    SCHEDULED: null,
    LIVE: { label: { he: 'חי', en: 'Live' }, color: 'error', variant: 'filled', icon: 'liveDot' },
    FINISHED: null,
    FORFEIT: { label: { he: 'ניצחון טכני', en: 'Forfeit' }, color: 'warning', variant: 'outlined' },
    POSTPONED: { label: { he: 'נדחה', en: 'Postponed' }, color: 'warning', variant: 'outlined' },
    CANCELLED: { label: { he: 'בוטל', en: 'Cancelled' }, color: 'default', variant: 'filled' },
};

export function tournamentStatusLabel(status: TournamentStatus, locale: TournamentLocale = 'he'): string {
    return TOURNAMENT_STATUS_TOKENS[status]?.label[locale] ?? status;
}

// ---- slots (spec 0.4) ----

export interface SlotContext {
    /** matchId -> match number, from the schedule or bracket payload. */
    matchNumberById?: ReadonlyMap<string, number> | Record<string, number>;
    /** groupId -> group display name (e.g. "א׳"). */
    groupNameById?: ReadonlyMap<string, string> | Record<string, string>;
    locale?: TournamentLocale;
}

export type SlotView =
    | { kind: 'team'; team: TeamLite }
    | { kind: 'placeholder'; text: string; placeholderType: 'WINNER_OF' | 'LOSER_OF' | 'GROUP_RANK' | 'SEED' | 'BYE' | 'TBD' };

function lookup<V>(m: ReadonlyMap<string, V> | Record<string, V> | undefined, key: string): V | undefined {
    if (!m) return undefined;
    return m instanceof Map ? m.get(key) : (m as Record<string, V>)[key];
}

export function matchNumberMap(matches: ReadonlyArray<Pick<TournamentMatch, 'id' | 'number'>>): Map<string, number> {
    return new Map(matches.map((m) => [m.id, m.number]));
}

export function groupNameMap(stages: ReadonlyArray<Pick<TournamentStage, 'groups'>>): Map<string, string> {
    const out = new Map<string, string>();
    for (const s of stages) for (const g of s.groups) out.set(g.id, displayGroupName(g.name));
    return out;
}

/** Placeholder text for a not-yet-known slot (spec 0.4). Accepts SEED / BYE for schedule previews. */
export function describeSlot(
    slot: MatchSlot | { team?: TeamLite | null; source?: unknown } | null | undefined,
    ctx: SlotContext = {}
): SlotView {
    const he = (ctx.locale ?? 'he') === 'he';
    if (slot?.team) return { kind: 'team', team: slot.team };
    const src = (slot?.source ?? null) as
        | { type?: string; matchId?: string; groupId?: string; rank?: number; seed?: number }
        | null;
    const num = (id?: string) => (id ? lookup(ctx.matchNumberById, id) : undefined);
    switch (src?.type) {
        case 'WINNER_OF':
        case 'LOSER_OF': {
            const n = num(src.matchId);
            const winner = src.type === 'WINNER_OF';
            const tail = n === undefined ? '' : ` ${n}`;
            const text = he
                ? `${winner ? 'המנצחת' : 'המפסידה'} במשחק${tail}`
                : `${winner ? 'Winner' : 'Loser'} of match${tail}`;
            return { kind: 'placeholder', text, placeholderType: src.type };
        }
        case 'GROUP_RANK': {
            const g = (src.groupId ? lookup(ctx.groupNameById, src.groupId) : undefined) ?? '';
            const text = he
                ? `מקום ${src.rank ?? ''} בבית${g ? ` ${g}` : ''}`
                : `${src.rank ?? ''} in group${g ? ` ${g}` : ''}`;
            return { kind: 'placeholder', text, placeholderType: 'GROUP_RANK' };
        }
        case 'SEED':
            return {
                kind: 'placeholder',
                text: he ? `מדורגת ${src.seed ?? ''}`.trim() : `Seed ${src.seed ?? ''}`.trim(),
                placeholderType: 'SEED',
            };
        case 'BYE':
            return { kind: 'placeholder', text: he ? 'פטור' : 'Bye', placeholderType: 'BYE' };
        default:
            return { kind: 'placeholder', text: he ? 'ייקבע בהמשך' : 'TBD', placeholderType: 'TBD' };
    }
}

// ---- scores ----

export type MatchSide = 'home' | 'away';

/** Which side won, from the persisted `winnerTeamId`, falling back to the score. `null` = draw / undecided. */
export function winnerSide(m: Pick<TournamentMatch, 'status' | 'home' | 'away' | 'winnerTeamId' | 'homeScore' | 'awayScore' | 'homePenalties' | 'awayPenalties'>): MatchSide | null {
    if (m.status !== 'FINISHED' && m.status !== 'FORFEIT') return null;
    if (m.winnerTeamId) {
        if (m.home.teamId === m.winnerTeamId) return 'home';
        if (m.away.teamId === m.winnerTeamId) return 'away';
    }
    if (m.homeScore == null || m.awayScore == null) return null;
    if (m.homeScore !== m.awayScore) return m.homeScore > m.awayScore ? 'home' : 'away';
    if (m.homePenalties != null && m.awayPenalties != null && m.homePenalties !== m.awayPenalties) {
        return m.homePenalties > m.awayPenalties ? 'home' : 'away';
    }
    return null;
}

/** Sets won by each side from a tennis `details.sets` array (a set counts for the higher number; ties count for nobody). */
export function setsWon(sets: ReadonlyArray<readonly [number, number]> | null | undefined): [number, number] {
    let h = 0;
    let a = 0;
    for (const [x, y] of sets ?? []) {
        if (x > y) h++;
        else if (y > x) a++;
    }
    return [h, a];
}

/** True when the match has a score worth showing in place of the kickoff time. */
export function hasScore(m: Pick<TournamentMatch, 'status' | 'homeScore' | 'awayScore'>): boolean {
    return m.homeScore != null && m.awayScore != null && m.status !== 'SCHEDULED' && m.status !== 'POSTPONED';
}

/** Short text for assistive tech: "<home> 2 – 1 <away>"; the visual uses separate spans (F1 1.1). */
export function scoreAriaLabel(home: string, away: string, hs: number | null, as: number | null): string {
    if (hs == null || as == null) return `${home} – ${away}`;
    return `${home} ${hs} – ${as} ${away}`;
}
