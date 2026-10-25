export type LotteryViewerKind = 'pool' | 'drawing' | 'not_selected' | 'selected';
export type LotteryJoinMode = 'join' | 'waitlist';

export interface LotteryViewerInput {
  lotteryEnabled?: boolean;
  lotteryPending?: boolean;
  lotteryAt?: string | null;
  /**
   * Set when the server included lotteryExecutedAt.
   * null = the draw has not run. A string = it has. Omit when the payload has no field,
   * so a real post-draw waitlist is not shown as "ההגרלה מתבצעת".
   */
  lotteryExecutedAt?: string | null;
  viewerParticipationStatus?: string | null;
  /** Confirmed seats still open. Only affects the not-selected detail and join label. */
  seatsFree?: boolean;
  /** Clock used to decide whether the draw time has passed. Defaults to now. */
  now?: Date;
  viewerIsOrganizer?: boolean;
  organizerInLottery?: boolean;
}

export interface LotteryViewerCopy {
  kind: LotteryViewerKind;
  title: string;
  detail: string | null;
  cancelLabel: string | null;
  canRejoin: boolean;
  joinMode: LotteryJoinMode | null;
  joinLabel: string | null;
  /** Set for confirmed winners so the normal confirmed controls can add this note. */
  selectedNote: string | null;
}

export function lotteryViewerCopy(input?: LotteryViewerInput): LotteryViewerCopy | null;

export interface LotteryEntrantListInput {
  lotteryEnabled?: boolean;
  lotteryPending?: boolean;
  lotteryAt?: string | null;
  /** null = the draw has not run. Omit or pass a timestamp to keep the ranked waitlist. */
  lotteryExecutedAt?: string | null;
  /** Names in this list. Used only for the "רשומים: N" line players already see. */
  count?: number;
  now?: Date;
}

export interface LotteryEntrantListCopy {
  kind: 'pool' | 'drawing';
  title: string;
  detail: string | null;
  /** Per-person label. Null while the draw is running — never a queue position. */
  rowLabel: string | null;
  registeredLabel: string;
  showQueuePosition: false;
}

/**
 * Organizer list of lottery entrants before the draw. Null after the draw
 * (and when this is not a lottery) so the ranked waitlist stays unchanged.
 */
export function lotteryEntrantListCopy(input?: LotteryEntrantListInput): LotteryEntrantListCopy | null;

/** Request label used when a not-selected viewer still needs approval. */
export function resolveNotSelectedJoinLabel(
  copy: LotteryViewerCopy | null | undefined,
  options?: { requiresApproval?: boolean },
): string | null;
export function guestRegistrationNotOpenMessage(opensAt?: string | null): string;
export function guestRegistrationOpensAtFromError(error: unknown): string | null;
/** Disabled join-button label, including the Jerusalem opening time when it is known. */
export function guestJoinClosedLabel(opensAt?: string | null): string;
export function isGuestRegistrationClosed(input?: {
  viewerIsInsider?: boolean;
  guestRegistrationOpensAt?: string | null;
  now?: Date;
}): boolean;
export function formatHebrewWhen(iso?: string | null): string | null;
export const DRAWING_TITLE: string;
