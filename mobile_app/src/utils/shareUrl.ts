/**
 * Single source of truth for every link the app shares. They must be the canonical WEB url of the
 * environment (so they open in the app via Universal/App Links when installed, and fall back to the
 * web page otherwise). Never a custom scheme, never an invented host.
 */
export const PROD_WEB_URL = 'https://join-up-app.vercel.app';

/** Web origin for this build. Dev/preview EAS profiles set EXPO_PUBLIC_WEB_URL; default is production. */
export function webBaseUrl(raw: string | undefined = process.env.EXPO_PUBLIC_WEB_URL): string {
  const v = (raw || '').trim().replace(/\/+$/, '');
  return /^https:\/\/[^/\s]+$/.test(v) ? v : PROD_WEB_URL;
}

const seg = (id: string | number) => encodeURIComponent(String(id));

export const gameShareUrl = (id: string | number, base: string = webBaseUrl()) => `${base}/games/${seg(id)}`;
export const seriesShareUrl = (id: string | number, base: string = webBaseUrl()) => `${base}/series/${seg(id)}`;
export const tournamentShareUrl = (id: string | number, base: string = webBaseUrl()) => `${base}/tournaments/${seg(id)}`;
