import { getErrorCode, getErrorStatus } from '@/utils/apiError';

/** Error `code`s the tournaments API can return (contract). Unknown codes still pass through as strings. */
export type TournamentErrorCode =
    | 'PLAYER_IN_OTHER_TEAM'
    | 'TOO_MANY_PLAYERS'
    | 'MINORS_NOT_ALLOWED'
    | 'ROSTER_LOCKED'
    | 'REGISTRATION_CLOSED'
    | 'NAME_TAKEN'
    | 'INVALID_CODE'
    | 'CAPTAIN_CANNOT_LEAVE'
    | 'ROSTER_INVALID'
    | 'TOURNAMENT_FULL'
    | 'CANNOT_START'
    | 'SCHEDULE_HAS_RESULTS'
    | 'SCHEDULE_CONFLICTS'
    | 'SCHEDULE_CONFLICT'
    | 'MATCH_REFERENCED'
    | 'MATCH_FINISHED'
    | 'VERSION_CONFLICT'
    | 'DOWNSTREAM_FINISHED'
    | 'NEEDS_PENALTIES'
    | 'INVALID_RESULT'
    | 'INVALID_SCORES'
    | 'INVALID_STATS'
    | 'NOT_IN_PROGRESS'
    | 'TEAMS_UNKNOWN'
    | 'WRONG_STATUS'
    | 'VALIDATION'
    | 'OVERRIDE_BLOCKED'
    | 'TOURNAMENT_CLOSED';

/** Base class for every failed tournaments call. `body` is the raw JSON error body (extras like `problems`). */
export class TournamentApiError extends Error {
    readonly status?: number;
    readonly code?: TournamentErrorCode | (string & {});
    readonly body: Record<string, unknown>;
    constructor(message: string, status?: number, code?: string, body: Record<string, unknown> = {}) {
        super(message);
        this.name = 'TournamentApiError';
        this.status = status;
        this.code = code;
        this.body = body;
    }
}

/** 409 VERSION_CONFLICT: someone else saved first. Refetch the match, then retry with the new version. */
export class VersionConflictError extends TournamentApiError {
    readonly currentVersion: number | undefined;
    constructor(message: string, status?: number, body: Record<string, unknown> = {}) {
        super(message, status, 'VERSION_CONFLICT', body);
        this.name = 'VersionConflictError';
        this.currentVersion = typeof body.currentVersion === 'number' ? body.currentVersion : undefined;
    }
}

/** 409 DOWNSTREAM_FINISHED: a later match already depends on this result. `canForce` = organizer may force. */
export class DownstreamFinishedError extends TournamentApiError {
    readonly matchId: string | undefined;
    readonly canForce: boolean;
    constructor(message: string, status?: number, body: Record<string, unknown> = {}) {
        super(message, status, 'DOWNSTREAM_FINISHED', body);
        this.name = 'DownstreamFinishedError';
        this.matchId = typeof body.matchId === 'string' ? body.matchId : undefined;
        this.canForce = body.canForce === true;
    }
}

/** 409 CANNOT_START: `problems` lists why (organizer may retry with `force`). */
export class CannotStartError extends TournamentApiError {
    readonly problems: unknown[];
    constructor(message: string, status?: number, body: Record<string, unknown> = {}) {
        super(message, status, 'CANNOT_START', body);
        this.name = 'CannotStartError';
        this.problems = Array.isArray(body.problems) ? body.problems : [];
    }
}

/** 409 SCHEDULE_CONFLICT / SCHEDULE_CONFLICTS: `conflicts` explains; retry with `force` / `allowConflicts`. */
export class ScheduleConflictError extends TournamentApiError {
    readonly conflicts: unknown[];
    constructor(message: string, status?: number, code = 'SCHEDULE_CONFLICT', body: Record<string, unknown> = {}) {
        super(message, status, code, body);
        this.name = 'ScheduleConflictError';
        this.conflicts = Array.isArray(body.conflicts) ? body.conflicts : [];
    }
}

/**
 * Convert whatever apiClient threw (Error with status/code/body) into a typed error.
 * Non-HTTP failures (network) become a plain TournamentApiError with no status/code.
 */
export function toTournamentError(e: unknown): TournamentApiError {
    if (e instanceof TournamentApiError) return e;
    const message = e instanceof Error ? e.message : 'Request failed';
    const status = getErrorStatus(e);
    const code = getErrorCode(e);
    const raw = (e as { body?: unknown } | null)?.body;
    const body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    switch (code) {
        case 'VERSION_CONFLICT':
            return new VersionConflictError(message, status, body);
        case 'DOWNSTREAM_FINISHED':
            return new DownstreamFinishedError(message, status, body);
        case 'CANNOT_START':
            return new CannotStartError(message, status, body);
        case 'SCHEDULE_CONFLICT':
        case 'SCHEDULE_CONFLICTS':
            return new ScheduleConflictError(message, status, code, body);
        default:
            return new TournamentApiError(message, status, code, body);
    }
}

const MESSAGES_HE: Record<string, string> = {
    PLAYER_IN_OTHER_TEAM: 'השחקן כבר רשום בקבוצה אחרת בטורניר',
    TOO_MANY_PLAYERS: 'הסגל מלא',
    MINORS_NOT_ALLOWED: 'הטורניר הזה אינו פתוח לקטינים',
    ROSTER_LOCKED: 'הסגל ננעל ואי אפשר לשנות אותו',
    REGISTRATION_CLOSED: 'ההרשמה סגורה',
    NAME_TAKEN: 'שם הקבוצה כבר תפוס בטורניר',
    INVALID_CODE: 'קוד ההצטרפות לא תקין',
    CAPTAIN_CANNOT_LEAVE: 'קפטן לא יכול לעזוב את הקבוצה',
    ROSTER_INVALID: 'הסגל לא עומד בדרישות הטורניר',
    TOURNAMENT_FULL: 'הטורניר מלא',
    CANNOT_START: 'אי אפשר להתחיל את הטורניר',
    SCHEDULE_HAS_RESULTS: 'כבר הוזנו תוצאות, אי אפשר ליצור לוח משחקים מחדש',
    SCHEDULE_CONFLICTS: 'יש התנגשויות בלוח המשחקים',
    SCHEDULE_CONFLICT: 'יש התנגשות בלוח המשחקים',
    MATCH_REFERENCED: 'משחקים אחרים תלויים במשחק הזה',
    MATCH_FINISHED: 'המשחק כבר הסתיים',
    VERSION_CONFLICT: 'המשחק עודכן על ידי מישהו אחר',
    DOWNSTREAM_FINISHED: 'משחק המשך כבר שוחק, אי אפשר לשנות את התוצאה',
    NEEDS_PENALTIES: 'במשחק נוק-אאוט צריך להזין פנדלים',
    INVALID_RESULT: 'התוצאה לא תקינה',
    INVALID_SCORES: 'התוצאה לא תקינה',
    INVALID_STATS: 'נתוני השחקנים לא תקינים',
    NOT_IN_PROGRESS: 'אפשר להזין תוצאות רק כשהטורניר מתקיים',
    TEAMS_UNKNOWN: 'הקבוצות במשחק עדיין לא ידועות',
    WRONG_STATUS: 'צריך לסגור את ההרשמה לפני שמירת לוח המשחקים',
    VALIDATION: 'אי אפשר לשמור את הדירוג. בדקו שהסדר כולל כל קבוצה ושלכל התאמת נקודות יש סיבה.',
    OVERRIDE_BLOCKED: 'משחק נוק-אאוט שכבר הסתיים תלוי בסדר הזה, אז אי אפשר לשנות את הדירוג.',
    TOURNAMENT_CLOSED: 'אי אפשר לעדכן דירוג בטורניר טיוטה או מבוטל.',
};

/** Hebrew user copy for a known code, or `null` so the caller can fall back to getActionErrorMessage. */
export function tournamentErrorMessage(e: unknown): string | null {
    const code = getErrorCode(e);
    return code && MESSAGES_HE[code] ? MESSAGES_HE[code] : null;
}
