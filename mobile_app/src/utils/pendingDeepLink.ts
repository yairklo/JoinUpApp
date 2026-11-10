/**
 * A deep link (e.g. /games/<id>) opened while signed out is parked here by AuthGuard, then
 * restored after sign-in instead of dumping the user on the home tab.
 */
let pending: string | null = null;

const isAuthPath = (p: string) => /^\/(sign-in|sign-up)(\/|$|\?)/.test(p);

/** Only in-app, non-root, non-auth paths are worth restoring. */
export function rememberDeepLink(path: string | null | undefined): void {
  if (!path || !path.startsWith('/') || path.startsWith('//') || path === '/' || isAuthPath(path)) return;
  pending = path;
}

export function consumeDeepLink(): string | null {
  const p = pending;
  pending = null;
  return p;
}
