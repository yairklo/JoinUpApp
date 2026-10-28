/**
 * Decides whether a notification response (from `useLastNotificationResponse`) should navigate.
 * That hook re-delivers the last tapped response on every cold start, so a tap must only act once
 * per notification (persisted id) and never on an old one.
 */
export const PUSH_TAP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type PushTapCheck = {
  actionIdentifier: string;
  defaultActionIdentifier: string;
  identifier?: string | null;
  /** notification.date — seconds on some platforms, milliseconds on others. */
  date?: number | null;
  lastHandledId: string | null;
  now: number;
  maxAgeMs?: number;
};

export function notificationDateMs(date: number | null | undefined): number | null {
  if (typeof date !== 'number' || !Number.isFinite(date) || date <= 0) return null;
  return date < 1e11 ? date * 1000 : date;
}

export function shouldHandlePushTap(c: PushTapCheck): boolean {
  if (c.actionIdentifier !== c.defaultActionIdentifier) return false;
  if (!c.identifier) return false;
  if (c.identifier === c.lastHandledId) return false;
  const ms = notificationDateMs(c.date);
  if (ms !== null && c.now - ms > (c.maxAgeMs ?? PUSH_TAP_MAX_AGE_MS)) return false;
  return true;
}
