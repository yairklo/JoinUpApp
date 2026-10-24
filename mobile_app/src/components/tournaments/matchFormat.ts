import type { TournamentMatch } from '@/types/tournament';

export type Lang = 'he' | 'en';

const TZ = 'Asia/Jerusalem';
const loc = (lang: Lang) => (lang === 'he' ? 'he-IL' : 'en-US');

function safe<T>(fn: () => T, fallback: T): T {
    try {
        return fn();
    } catch {
        return fallback;
    }
}

/** "18:30" in Israel time. */
export function fmtTime(iso: string | null | undefined, lang: Lang): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return safe(
        () => d.toLocaleTimeString(loc(lang), { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ }),
        d.toISOString().slice(11, 16)
    );
}

/** Match-day key `yyyy-mm-dd` in Israel time (testIDs, grouping). */
export function dayKey(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return safe(() => d.toLocaleDateString('en-CA', { timeZone: TZ }), d.toISOString().slice(0, 10));
}

/** "יום שישי, 12 בנובמבר" (day header). */
export function fmtDayHeader(iso: string, lang: Lang): string {
    const d = new Date(iso);
    return safe(() => d.toLocaleDateString(loc(lang), { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }), dayKey(iso));
}

/** "שישי 12/11" (day chip). */
export function fmtDayChip(iso: string, lang: Lang): string {
    const d = new Date(iso);
    return safe(() => d.toLocaleDateString(loc(lang), { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: TZ }), dayKey(iso));
}

/** "שישי 12/11 · 18:30" (match detail header). */
export function fmtDateTime(iso: string | null | undefined, lang: Lang): string {
    if (!iso) return '';
    return `${fmtDayChip(iso, lang)} · ${fmtTime(iso, lang)}`;
}

/** True when the device is not in Israel time (then the detail header adds "Israel time"). */
export function deviceTzDiffers(): boolean {
    return safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone !== TZ, false);
}

export type Side = 'home' | 'away';

/** Winner of a played match: server `winnerTeamId`, else score, else penalties. */
export function matchWinner(m: Pick<TournamentMatch, 'status' | 'home' | 'away' | 'homeScore' | 'awayScore' | 'homePenalties' | 'awayPenalties' | 'winnerTeamId'>): Side | null {
    if (m.status !== 'FINISHED' && m.status !== 'FORFEIT') return null;
    if (m.winnerTeamId) {
        if (m.winnerTeamId === m.home.teamId || m.winnerTeamId === m.home.team?.id) return 'home';
        if (m.winnerTeamId === m.away.teamId || m.winnerTeamId === m.away.team?.id) return 'away';
    }
    if (m.homeScore == null || m.awayScore == null) return null;
    if (m.homeScore !== m.awayScore) return m.homeScore > m.awayScore ? 'home' : 'away';
    if (m.homePenalties != null && m.awayPenalties != null && m.homePenalties !== m.awayPenalties) {
        return m.homePenalties > m.awayPenalties ? 'home' : 'away';
    }
    return null;
}

/** Google Calendar template link (same approach as the game screen). 90 minutes default length. */
export function calendarUrl(m: TournamentMatch, title: string, location?: string): string | null {
    if (!m.scheduledAt) return null;
    const start = new Date(m.scheduledAt);
    if (Number.isNaN(start.getTime())) return null;
    const end = new Date(start.getTime() + 90 * 60000);
    const f = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, '');
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${f(start)}/${f(end)}&location=${encodeURIComponent(location ?? '')}`;
}

const LRI = '\u2066';
const PDI = '\u2069';

/** LTR isolate so a leading sign stays in front ("+4", "−1") inside an RTL paragraph. */
export function ltrIsolate(text: string): string {
    return `${LRI}${text}${PDI}`;
}

/**
 * English stage labels stored by older schedule builders. New schedules already
 * write Hebrew (`ליגה`, `נוקאאוט`, `בתים`, `משחקים`); this only covers those leftovers.
 */
const STAGE_NAME_HE: Record<string, string> = {
    League: 'ליגה',
    Knockout: 'נוקאאוט',
    Groups: 'בתים',
    Matches: 'משחקים',
};

export function displayStageName(name: string | null | undefined, lang: Lang = 'he'): string {
    if (!name) return '';
    if (lang === 'en') return name;
    return STAGE_NAME_HE[name] ?? name;
}

/** Signed goal difference with a real minus (U+2212), isolated LTR. */
export function fmtGd(n: number): string {
    const body = n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0';
    return ltrIsolate(body);
}
