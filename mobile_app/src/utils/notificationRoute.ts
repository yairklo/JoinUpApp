/**
 * Pure mapping from a notification (push payload or stored feed row) to an app route.
 * Shared by the notifications list and the push-tap handler so both open the same screen.
 * Returns null when nothing in the payload points anywhere; callers pick their own fallback.
 */
export const NOTIFICATIONS_FALLBACK_ROUTE = '/notifications';

export type NotificationRouteInput = {
  type?: string | null;
  data?: Record<string, unknown> | null;
};

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;

/** Normalizes a server-provided link into an in-app route; null if it is unusable. */
export function normalizeNotificationLink(link: unknown): string | null {
  const raw = str(link);
  // In-app paths only — never a scheme or protocol-relative URL.
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return null;
  if (raw === '/') return null;
  // Older notifications stored /profile/:id, which has no route in the app (it is /user/:id).
  const legacyProfile = raw.match(/^\/profile\/([^/?#]+)$/);
  if (legacyProfile) return legacyProfile[1] !== 'settings' ? `/user/${legacyProfile[1]}` : null;
  return raw.replace(/^\/games\//, '/game/');
}

export function resolveNotificationRoute(input: NotificationRouteInput): string | null {
  const data = input.data || {};
  const type = str(input.type) || str(data.type);

  const chatId = str(data.chatId) || str(data.roomId);
  if (chatId) return `/chat/${chatId}`;

  const gameId = str(data.gameId);
  if (gameId) return `/game/${gameId}`;

  const seriesId = str(data.seriesId);
  if (seriesId) return `/series/${seriesId}`;

  if (type === 'TOURNAMENT_TEAM_INVITE') return '/tournaments/invites';
  const tournamentId = str(data.tournamentId);
  if (tournamentId) return `/tournaments/${tournamentId}`;

  if (type === 'FRIEND_REQUEST') return '/friends';
  if (type === 'FRIEND_ACCEPTED') {
    const userId = str(data.userId) || str(data.actorId);
    if (userId) return `/user/${userId}`;
  }

  return normalizeNotificationLink(data.link);
}
