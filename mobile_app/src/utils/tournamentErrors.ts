import type { ScheduleConflict, TournamentErrorCode } from '@/types/tournament';

type ApiErr = { status?: number; code?: string; body?: any } | null | undefined;

/** i18n key (namespace `tournaments.errors.*`) per known server `code`. Unknown codes map to `undefined`. */
const ERROR_KEYS: Partial<Record<TournamentErrorCode, string>> = {
    PLAYER_IN_OTHER_TEAM: 'tournaments.errors.PLAYER_IN_OTHER_TEAM',
    TOO_MANY_PLAYERS: 'tournaments.errors.TOO_MANY_PLAYERS',
    ROSTER_LOCKED: 'tournaments.errors.ROSTER_LOCKED',
    REGISTRATION_CLOSED: 'tournaments.errors.REGISTRATION_CLOSED',
    NAME_TAKEN: 'tournaments.errors.NAME_TAKEN',
    INVALID_CODE: 'tournaments.errors.INVALID_CODE',
    CAPTAIN_CANNOT_LEAVE: 'tournaments.errors.CAPTAIN_CANNOT_LEAVE',
    ROSTER_INVALID: 'tournaments.errors.ROSTER_INVALID',
    TOURNAMENT_FULL: 'tournaments.errors.TOURNAMENT_FULL',
    MATCH_REFERENCED: 'tournaments.manage.sched.matchReferenced',
    MATCH_FINISHED: 'tournaments.manage.sched.matchFinished',
    SCHEDULE_HAS_RESULTS: 'tournaments.manage.sched.hasResults',
    NOT_IN_PROGRESS: 'tournaments.score.notInProgress',
    TEAMS_UNKNOWN: 'tournaments.score.teamsUnknown',
    NEEDS_PENALTIES: 'tournaments.score.penaltiesHint',
    INVALID_RESULT: 'tournaments.score.invalid',
    INVALID_SCORES: 'tournaments.score.invalid',
    INVALID_STATS: 'tournaments.score.invalid',
};

/** The `minors` card is not an error string: callers show `tournaments.minors.*` for this code. */
export const isMinorsBlocked = (err: ApiErr) => err?.code === 'MINORS_NOT_ALLOWED';

export const isNotFound = (err: ApiErr) => err?.status === 404;

/**
 * i18n key for a failed tournament call, or `undefined` when the caller should fall back to a generic
 * message. `PLAYER_IN_OTHER_TEAM` uses the `_SELF` variant when `opts.self` (the viewer joins/registers).
 * Never render the raw server `error` string.
 */
export function tournamentErrorKey(err: ApiErr, opts: { self?: boolean } = {}): string | undefined {
    const code = err?.code as TournamentErrorCode | undefined;
    if (!code) return undefined;
    if (code === 'PLAYER_IN_OTHER_TEAM' && opts.self) return 'tournaments.errors.PLAYER_IN_OTHER_TEAM_SELF';
    return ERROR_KEYS[code];
}

/** Interpolation params the key may need, read from the error body (`{ max }`, `{ min }` when the server sends them). */
export function tournamentErrorParams(err: ApiErr): Record<string, unknown> {
    const b = err?.body ?? {};
    const out: Record<string, unknown> = {};
    if (b.max != null) out.max = b.max;
    if (b.min != null) out.min = b.min;
    return out;
}

/** `CANNOT_START` problems (organizer may `force`). Each has a `code` matching `tournaments.manage.problem.*`. */
export function startProblems(err: ApiErr): { code: string; [k: string]: unknown }[] {
    return err?.code === 'CANNOT_START' && Array.isArray(err.body?.problems) ? err.body.problems : [];
}

/** Conflicts from `SCHEDULE_CONFLICT` / `SCHEDULE_CONFLICTS` (retry with `force` / `allowConflicts`). */
export function scheduleConflicts(err: ApiErr): ScheduleConflict[] {
    return (err?.code === 'SCHEDULE_CONFLICT' || err?.code === 'SCHEDULE_CONFLICTS') && Array.isArray(err.body?.conflicts)
        ? err.body.conflicts
        : [];
}
