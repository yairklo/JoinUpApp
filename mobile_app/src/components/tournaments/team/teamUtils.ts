import type { TFunction } from 'i18next';
import { isMinorsBlocked, tournamentErrorKey, tournamentErrorParams } from '@/utils/tournamentErrors';

/** Same palette as the quick-teams jersey picker, kept in one place for tournament teams. */
export const TEAM_COLORS = ['#f97316', '#3b82f6', '#ef4444', '#22c55e', '#eab308', '#a855f7', '#1f2937', '#14b8a6'];

export type TeamErrorKind = { kind: 'minors' } | { kind: 'message'; message: string };

/**
 * Maps an apiClient error to what the screen shows inline: the minors card for `MINORS_NOT_ALLOWED`,
 * a plain-language message for known codes, a generic one otherwise. Never the raw server string.
 * `self` = the viewer is the one joining / registering.
 */
export function describeTeamError(t: TFunction, err: any, opts: { self?: boolean } = {}): TeamErrorKind {
    if (isMinorsBlocked(err)) return { kind: 'minors' };
    const key = tournamentErrorKey(err, opts);
    if (key) return { kind: 'message', message: String(t(key, tournamentErrorParams(err) as any)) };
    return { kind: 'message', message: String(t('common.error')) };
}

/** Public link for a team's join code (spec 4.6: `/tournaments/{id}?join={code}`). */
export const joinLink = (tournamentId: string, code: string) =>
    `https://join-up-app.vercel.app/tournaments/${encodeURIComponent(tournamentId)}?join=${encodeURIComponent(code)}`;
