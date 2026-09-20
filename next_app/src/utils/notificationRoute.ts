type NotificationLike = {
  type?: string;
  data?: { link?: string; gameId?: string; userId?: string; [key: string]: unknown } | null;
};

// Web routes that live under /profile and must not be mistaken for /profile/:userId.
const PROFILE_SUBROUTES = new Set(["friends", "search-players", "settings"]);

/**
 * Where a notification click should navigate on the web app.
 *
 * The `data.link` string is written by the server for both clients and is mobile-style
 * (`/game/:id`, `/user/:id`, `/friends`), or was generated with a path that exists on neither
 * (`/profile/:id`), so on the web it 404s. The route is therefore derived from the notification
 * type / ids first, and only then from a normalised `link`.
 */
export function resolveNotificationRoute(notif: NotificationLike): string | null {
  const data = notif.data || {};

  if (data.gameId) return `/games/${data.gameId}`;

  switch (notif.type) {
    case "FRIEND_REQUEST":
      return "/profile/friends";
    case "FRIEND_ACCEPTED":
      return data.userId ? `/users/${data.userId}` : "/profile/friends";
    default:
      break;
  }

  const link = typeof data.link === "string" ? data.link : "";
  if (!link) return null;

  if (link === "/friends") return "/profile/friends";

  const game = link.match(/^\/games?\/([^/?#]+)/);
  if (game) return `/games/${game[1]}`;

  const user = link.match(/^\/users?\/([^/?#]+)/);
  if (user) return `/users/${user[1]}`;

  const profile = link.match(/^\/profile\/([^/?#]+)$/);
  if (profile && !PROFILE_SUBROUTES.has(profile[1])) return `/users/${profile[1]}`;

  return link;
}
