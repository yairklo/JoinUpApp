import type { ScheduleConflict, TournamentTeam } from '@/types/tournament';

/** All tournament schedule times are shown and entered in Israel time (spec 11.2), whatever the device zone. */
export const ISRAEL_TZ = 'Asia/Jerusalem';

const parts = (iso: string, opts: Intl.DateTimeFormatOptions, locale: string) => new Intl.DateTimeFormat(locale, { timeZone: ISRAEL_TZ, ...opts }).format(new Date(iso));

/** "18:30" in Israel time. */
export const israelTime = (iso: string, lang: 'he' | 'en') => parts(iso, { hour: '2-digit', minute: '2-digit', hour12: false }, lang === 'he' ? 'he-IL' : 'en-GB');

/** "Sun 18/10" in Israel time. */
export const israelDay = (iso: string, lang: 'he' | 'en') =>
    parts(iso, { weekday: 'short', day: 'numeric', month: 'numeric' }, lang === 'he' ? 'he-IL' : 'en-GB');

/** `YYYY-MM-DD` of an instant in Israel time (day grouping key). */
export function israelDateKey(iso: string): string {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: ISRAEL_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
    return p;
}

/** `HH:mm` of an instant in Israel time. */
export function israelHm(iso: string): string {
    return new Intl.DateTimeFormat('en-GB', { timeZone: ISRAEL_TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

/** Israel wall-clock `YYYY-MM-DD` + `HH:mm` -> UTC ISO instant (handles DST by measuring the zone offset). */
export function israelToIso(date: string, time: string): string | null {
    const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    const tm = /^(\d{1,2}):(\d{2})$/.exec(time);
    if (!d || !tm) return null;
    const asUtc = Date.UTC(+d[1], +d[2] - 1, +d[3], +tm[1], +tm[2]);
    const shown = new Intl.DateTimeFormat('en-CA', {
        timeZone: ISRAEL_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(new Date(asUtc));
    const g = (type: string) => Number(shown.find((x) => x.type === type)?.value);
    const hour = g('hour') === 24 ? 0 : g('hour');
    const offset = Date.UTC(g('year'), g('month') - 1, g('day'), hour, g('minute')) - asUtc;
    const ms = asUtc - offset;
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export const isDateStr = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
export const isTimeStr = (s: string) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(s);

/** Normalises "9:5"-style input to `HH:mm` when valid, else returns the input unchanged. */
export function padTime(s: string): string {
    const m = /^(\d{1,2}):(\d{1,2})$/.exec(s.trim());
    if (!m) return s;
    return `${m[1].padStart(2, '0')}:${m[2].padStart(2, '0')}`;
}

export interface ConflictView {
    type: ScheduleConflict['type'];
    titleKey: string;
    bodyKey: string;
    params: Record<string, string | number>;
    /** Numbers of the matches involved (chips). */
    numbers: number[];
}

/**
 * Turns a server conflict (`{ type, matchIds, teamId?, court? }`) into i18n keys and params.
 * `numberOf` maps a match id (or preview key) to its number; `teams` resolves `teamId`. The server's
 * English `message` is never shown (spec 11.2).
 */
export function describeConflict(
    c: ScheduleConflict,
    numberOf: (id: string) => number | undefined,
    teams: Pick<TournamentTeam, 'id' | 'name'>[],
    minRest: number,
    courtLabel: (court: string) => string
): ConflictView {
    const ids = Array.isArray(c.matchIds) ? (c.matchIds as unknown[]).map(String) : [];
    const numbers = ids.map((id) => numberOf(id)).filter((n): n is number => n != null);
    const team = teams.find((x) => x.id === c.teamId)?.name ?? '';
    return {
        type: c.type,
        titleKey: `tournaments.manage.conflict.${c.type}.title`,
        bodyKey: `tournaments.manage.conflict.${c.type}.body`,
        params: {
            a: `#${numbers[0] ?? ''}`,
            b: `#${numbers[1] ?? ''}`,
            team,
            min: minRest,
            court: c.court != null ? courtLabel(String(c.court)) : '',
        },
        numbers,
    };
}
