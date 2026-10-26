import type { RuntimeCaching } from "next-pwa";

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/**
 * Runtime caches that may hold per-user data (authenticated API JSON, page HTML, RSC payloads).
 * `PwaCacheCleanup` deletes them on sign-out. "cross-origin"/"apis" are the old API caches; the
 * rest are next-pwa's page/RSC buckets ("others" is the same-origin catch-all that stored
 * navigations and `?_rsc=` fetches). The current worker no longer writes any of them
 * (see `buildRuntimeCaching`), so this also cleans up caches left by older installs.
 */
export const PWA_PRIVATE_CACHE_NAMES = [
  "cross-origin",
  "apis",
  "others",
  "pages",
  "pages-rsc",
  "pages-rsc-prefetch",
  "next-data",
  "start-url",
] as const;

// Same-origin routes that render signed-in content. Redundant with the "others" -> NetworkOnly
// swap below, kept as an explicit second line of defence.
const AUTHENTICATED_ROUTES = [
  "profile",
  "games",
  "series",
  "chat",
  "notifications",
  "settings",
  "admin",
  "tournaments",
  "manage",
];

// A RegExp, not a function: GenerateSW serializes urlPattern into sw.js, so a function could not
// read variables from this module's closure.
export function buildApiNetworkOnly(apiOrigin: string): RuntimeCaching {
  return {
    // Authenticated responses (/users/me, chats, notifications, Clerk sessions) must never land in
    // Cache Storage. Matches: every request to the API origin, any /api/* or /__clerk/* path
    // (same-origin routes, the Clerk proxy), and Clerk hosts (*.clerk.com, *.clerk.accounts.dev,
    // clerk.<domain>).
    urlPattern: new RegExp(
      [
        `^${escapeRegExp(apiOrigin)}(?:/|$)`,
        String.raw`^https?://[^/]+/(?:api|__clerk)(?:[/?#]|$)`,
        String.raw`^https://(?:[^/]+\.)?clerk\.(?:com|accounts\.dev)(?:[/:?#]|$)`,
        String.raw`^https://clerk\.[^/]+/`,
      ].join("|"),
    ),
    handler: "NetworkOnly",
  };
}

/** Next.js App Router RSC payloads (`?_rsc=` on every client navigation / prefetch). */
export const rscNetworkOnly: RuntimeCaching = {
  urlPattern: /[?&]_rsc=/,
  handler: "NetworkOnly",
};

/** Same-origin pages/RSC under authenticated routes. */
export const authenticatedRoutesNetworkOnly: RuntimeCaching = {
  urlPattern: new RegExp(`^https?://[^/]+/(?:${AUTHENTICATED_ROUTES.join("|")})(?:[/?#]|$)`),
  handler: "NetworkOnly",
};

const NETWORK_ONLY_DEFAULT_BUCKETS = new Set(["others", "next-data", "apis"]);

/**
 * Service-worker runtime caching: API / RSC / authenticated-route requests are NetworkOnly, and
 * next-pwa's default same-origin catch-all ("others", NetworkFirst, which cached every HTML
 * navigation and RSC fetch, and "next-data") is turned into NetworkOnly too. The static-asset
 * defaults (fonts, images, js/css, _next/image) are kept, and Workbox precache is untouched.
 * Routes are matched first-wins, so the NetworkOnly rules come before the defaults.
 */
export function buildRuntimeCaching(apiOrigin: string, defaultCache: RuntimeCaching[]): RuntimeCaching[] {
  const defaults = defaultCache.map((entry): RuntimeCaching => {
    const cacheName = (entry.options as { cacheName?: string } | undefined)?.cacheName;
    return cacheName && NETWORK_ONLY_DEFAULT_BUCKETS.has(cacheName)
      ? { urlPattern: entry.urlPattern, handler: "NetworkOnly", ...(entry.method ? { method: entry.method } : {}) }
      : entry;
  });
  return [buildApiNetworkOnly(apiOrigin), rscNetworkOnly, authenticatedRoutesNetworkOnly, ...defaults];
}
