import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import type { MatchSource, MatchStatus, TournamentStatus } from '@/types/tournament';

/**
 * Token helpers of docs/plans/design-spec-D0-tournaments.md 0.3 (status chips) and 0.4 (slot
 * placeholders). Classes are full literal strings so NativeWind can see them.
 */

export interface ChipTone {
    /** Pill container classes (light + `dark:`). */
    container: string;
    /** Text classes. */
    text: string;
}

const PILL = 'px-2.5 py-1 rounded-full';

export const TOURNAMENT_STATUS_TONE: Record<TournamentStatus, ChipTone> = {
    DRAFT: {
        container: `${PILL} border border-gray-300 dark:border-cyber-border`,
        text: 'text-gray-600 dark:text-cyber-muted',
    },
    REGISTRATION_OPEN: {
        container: `${PILL} bg-brand-mist dark:bg-brand-ink`,
        text: 'text-brand-dark dark:text-brand-light',
    },
    REGISTRATION_CLOSED: {
        container: `${PILL} bg-gray-100 dark:bg-cyber-border`,
        text: 'text-gray-700 dark:text-cyber-text',
    },
    IN_PROGRESS: {
        container: `${PILL} bg-indigo-50 dark:bg-indigo-950`,
        text: 'text-indigo-700 dark:text-indigo-300',
    },
    COMPLETED: {
        container: `${PILL} bg-gray-100 dark:bg-cyber-border`,
        text: 'text-gray-700 dark:text-cyber-text',
    },
    CANCELLED: {
        container: `${PILL} border border-red-200 dark:border-red-900`,
        text: 'text-red-600 dark:text-red-400',
    },
};

const AMBER_OUTLINE: ChipTone = {
    container: `${PILL} border border-amber-300 dark:border-amber-800`,
    text: 'text-amber-700 dark:text-amber-300',
};

/** Only the statuses that show a chip (SCHEDULED and FINISHED have none: the time / the score is the signal). */
export const MATCH_STATUS_TONE: Partial<Record<MatchStatus, ChipTone>> = {
    LIVE: { container: `${PILL} bg-red-50 dark:bg-red-950`, text: 'text-red-700 dark:text-red-300' },
    FORFEIT: AMBER_OUTLINE,
    POSTPONED: AMBER_OUTLINE,
    CANCELLED: {
        container: `${PILL} bg-gray-100 dark:bg-cyber-border`,
        text: 'text-gray-600 dark:text-cyber-muted',
    },
};

/** Match card wrapper opacity: cancelled cards are shown at 60% (spec 0.3). */
export const matchCardOpacity = (status: MatchStatus): number => (status === 'CANCELLED' ? 0.6 : 1);

/** Slot placeholder text classes (spec 0.4). */
export const SLOT_PLACEHOLDER_TEXT = 'text-gray-500 italic dark:text-cyber-muted';

export interface SlotDescription {
    kind: 'team' | 'placeholder';
    /** i18n key under `tournaments.slot.*` (placeholders only). */
    key?: string;
    params?: Record<string, string | number>;
}

/**
 * Which placeholder a team-less slot shows. `numberById` maps `source.matchId` to the match number
 * (from the schedule/bracket payload; `useTournamentSchedule().numberById`). `groupNames` maps
 * groupId to the group name. `seed` / `bye` are for slots the payload marks that way.
 */
export function describeSlot(
    slot: { team: unknown | null; source: MatchSource },
    ctx: { numberById?: Record<string, number>; groupNames?: Record<string, string>; seed?: number | null; bye?: boolean } = {}
): SlotDescription {
    if (slot.team) return { kind: 'team' };
    if (ctx.bye) return { kind: 'placeholder', key: 'tournaments.slot.bye' };
    const s = slot.source;
    if (s?.type === 'WINNER_OF' || s?.type === 'LOSER_OF') {
        const n = ctx.numberById?.[s.matchId];
        if (n != null) {
            return {
                kind: 'placeholder',
                key: s.type === 'WINNER_OF' ? 'tournaments.slot.winnerOf' : 'tournaments.slot.loserOf',
                params: { n },
            };
        }
    } else if (s?.type === 'GROUP_RANK') {
        return {
            kind: 'placeholder',
            key: 'tournaments.slot.groupRank',
            params: { rank: s.rank, group: ctx.groupNames?.[s.groupId] ?? '' },
        };
    }
    if (ctx.seed != null) return { kind: 'placeholder', key: 'tournaments.slot.seed', params: { n: ctx.seed } };
    return { kind: 'placeholder', key: 'tournaments.slot.tbd' };
}

/** Sets won by each side from a tennis `details.sets` list (a set is won by the higher number). */
export function setsWon(sets: [number, number][] | undefined): { home: number; away: number } {
    let home = 0;
    let away = 0;
    for (const [h, a] of sets ?? []) {
        if (h > a) home += 1;
        else if (a > h) away += 1;
    }
    return { home, away };
}

/** `FINAL`/`SEMI_FINAL`/... come as the server `name`; anything else is "Round of N" or used verbatim. */
export function bracketRoundKey(name: string | undefined | null): { key: string; params?: Record<string, string | number> } | null {
    if (!name) return null;
    const known = ['FINAL', 'SEMI_FINAL', 'QUARTER_FINAL', 'ROUND_OF_16'];
    if (known.includes(name)) return { key: `tournaments.bracket.${name}` };
    const m = /^ROUND_OF_(\d+)$/.exec(name);
    if (m) return { key: 'tournaments.bracket.roundOfN', params: { n: Number(m[1]) } };
    if (name === 'THIRD_PLACE') return { key: 'tournaments.bracket.thirdPlace' };
    return null;
}

/** Ionicons per tab / meaning (spec 0.6, mobile column). */
export const TOURNAMENT_ICONS = {
    tournament: 'trophy-outline',
    champion: 'trophy',
    bracket: 'git-network-outline',
    standings: 'list-outline',
    schedule: 'calendar-outline',
    teams: 'people-outline',
    leaders: 'stats-chart-outline',
    overview: 'information-circle-outline',
    copy: 'copy-outline',
    share: 'share-social-outline',
    rotate: 'refresh',
    captain: 'shield',
    manualRank: 'hand-left-outline',
    court: 'location-outline',
    conflict: 'alert-circle-outline',
    addToCalendar: 'calendar-number-outline',
    invite: 'person-add-outline',
} as const;

/** True when the OS asks for reduced motion (no pulsing live dot, no row flash). */
export function useReducedMotion(): boolean {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        let mounted = true;
        AccessibilityInfo.isReduceMotionEnabled?.()
            .then((v) => mounted && setReduced(Boolean(v)))
            .catch(() => {});
        const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v) => setReduced(Boolean(v)));
        return () => {
            mounted = false;
            sub?.remove?.();
        };
    }, []);
    return reduced;
}
