// Hebrew copy for lottery registration states and the members-vs-guests join error.
// Web and mobile both render these strings so the game page cannot drift.
const { formatJerusalemDate, formatJerusalemTime } = require('./timezone');

const POOL_TITLE = 'נרשמת להגרלה';
const POOL_CANCEL = 'בטל הרשמה להגרלה';
const POOL_DETAIL_FALLBACK = 'המקומות יוגרלו במועד ההגרלה';
const DRAWING_TITLE = 'ההגרלה מתבצעת';
// Same labels the game page already shows players on a pending lottery
// (the "הגרלה ממתינה" alert, the entrant row "ממתין להגרלה", and "רשומים: N").
const POOL_ALERT_TITLE = 'הגרלה ממתינה';
const POOL_ENTRANT_LABEL = 'ממתין להגרלה';
const NOT_SELECTED_TITLE = 'לא נבחרת בהגרלה';
const NOT_SELECTED_FREE = 'יש מקומות פנויים, אפשר להצטרף למשחק';
const NOT_SELECTED_FULL = 'אין מקום פנוי, אפשר להצטרף לרשימת המתנה';
const JOIN_LABEL = 'הצטרף למשחק';
const WAITLIST_JOIN_LABEL = 'הצטרף לרשימת המתנה';
const APPROVAL_JOIN_LABEL = 'בקש להצטרף';
const SELECTED_NOTE = 'נבחרת בהגרלה';
const GUEST_BASE = 'ההרשמה לאורחים טרם נפתחה - חברי הקבוצה נרשמים ראשונים';

/** "24/10/2026 בשעה 18:00" in Asia/Jerusalem, or null when the instant is missing/invalid. */
function formatHebrewWhen(iso) {
  if (!iso) return null;
  const date = formatJerusalemDate(iso);
  const time = formatJerusalemTime(iso);
  if (!date || !time) return null;
  const [year, month, day] = date.split('-');
  if (!year || !month || !day) return null;
  return `${day}/${month}/${year} בשעה ${time}`;
}

function drawHasPassed(lotteryAt, now) {
  if (!lotteryAt) return false;
  const at = new Date(lotteryAt);
  if (Number.isNaN(at.getTime())) return false;
  return at.getTime() <= now.getTime();
}

/**
 * Maps a viewer's roster status on a lottery game to the banner/button copy.
 * Returns null for ordinary states (real waitlist, pending approval, not registered)
 * so callers keep their existing substitute/join copy.
 *
 * - pool: WAITLISTED while the draw has not run (lotteryPending).
 * - drawing: WAITLISTED after lotteryAt, before lotteryExecutedAt. The overdue draw has
 *   not landed yet, so this is not the substitute waitlist.
 * - not_selected: the draw left them out. They may join a free seat or the waitlist.
 * - selected: CONFIRMED after the draw time. Callers keep the normal confirmed controls
 *   and may show `selectedNote`. An organizer who opted out of the draw is not a winner.
 */
function lotteryViewerCopy(input = {}) {
  const status = input.viewerParticipationStatus || null;
  const enabled = !!input.lotteryEnabled;
  const pending = !!input.lotteryPending;

  if (status === 'NOT_SELECTED') {
    const seatsFree = !!input.seatsFree;
    return {
      kind: 'not_selected',
      title: NOT_SELECTED_TITLE,
      detail: seatsFree ? NOT_SELECTED_FREE : NOT_SELECTED_FULL,
      cancelLabel: null,
      canRejoin: true,
      joinMode: seatsFree ? 'join' : 'waitlist',
      joinLabel: seatsFree ? JOIN_LABEL : WAITLIST_JOIN_LABEL,
      selectedNote: null,
    };
  }

  if (!enabled) return null;

  // Both flags have to be explicit: executedAt null (not omitted) and lotteryPending
  // false (the server clock has passed lotteryAt). A real substitute waitlist has
  // lotteryExecutedAt set, so it must not land here.
  if (status === 'WAITLISTED' && input.lotteryExecutedAt === null && input.lotteryPending === false && input.lotteryAt) {
    return {
      kind: 'drawing',
      title: DRAWING_TITLE,
      detail: null,
      cancelLabel: null,
      canRejoin: false,
      joinMode: null,
      joinLabel: null,
      selectedNote: null,
    };
  }

  if (pending && status === 'WAITLISTED') {
    const when = formatHebrewWhen(input.lotteryAt);
    return {
      kind: 'pool',
      title: POOL_TITLE,
      detail: when ? `ההגרלה ב-${when}` : POOL_DETAIL_FALLBACK,
      cancelLabel: POOL_CANCEL,
      canRejoin: false,
      joinMode: null,
      joinLabel: null,
      selectedNote: null,
    };
  }

  if (status === 'CONFIRMED' && !pending) {
    if (input.viewerIsOrganizer && input.organizerInLottery === false) return null;
    const now = input.now instanceof Date ? input.now : new Date();
    if (!drawHasPassed(input.lotteryAt, now)) return null;
    return {
      kind: 'selected',
      title: SELECTED_NOTE,
      detail: null,
      cancelLabel: null,
      canRejoin: false,
      joinMode: null,
      joinLabel: null,
      selectedNote: SELECTED_NOTE,
    };
  }

  return null;
}

/**
 * Button label after a missed draw. Approval-gated viewers do not take a seat
 * directly, so they get the request label instead of join / waitlist.
 * Returns null when the viewer is not in the not-selected state.
 */
function resolveNotSelectedJoinLabel(copy, { requiresApproval = false } = {}) {
  if (!copy || copy.kind !== 'not_selected') return null;
  if (requiresApproval) return APPROVAL_JOIN_LABEL;
  return copy.joinLabel;
}

/** Short disabled-button label. The opening time uses the same Jerusalem format as the draw. */
function guestJoinClosedLabel(opensAt) {
  const when = formatHebrewWhen(opensAt);
  if (!when) return 'ההרשמה לאורחים טרם נפתחה';
  return `נפתח ב-${when}`;
}

/**
 * True only for a known guest (viewerIsInsider === false) before guestRegistrationOpensAt.
 * Insiders and callers that do not know insider status stay open; the server gate is unchanged.
 */
function isGuestRegistrationClosed(input = {}) {
  if (!input || input.viewerIsInsider !== false) return false;
  if (!input.guestRegistrationOpensAt) return false;
  const at = new Date(input.guestRegistrationOpensAt);
  if (Number.isNaN(at.getTime())) return false;
  const now = input.now instanceof Date ? input.now : new Date();
  return now.getTime() < at.getTime();
}

function guestRegistrationNotOpenMessage(opensAt) {
  const when = formatHebrewWhen(opensAt);
  if (!when) return GUEST_BASE;
  return `${GUEST_BASE}. נפתחת ב-${when}`;
}

function lotteryRegisteredLabel(count) {
  const n = Number.isFinite(count) ? count : 0;
  return `רשומים: ${n}`;
}

/**
 * Organizer/manager list of WAITLISTED entrants.
 * Before the draw they are an unordered lottery pool: the pending-lottery alert,
 * the draw-time sentence, and the entrant label players already see — never a
 * queue position. "נרשמת להגרלה" stays on the viewer's own banner; it addresses
 * that person, not the list of everyone else.
 * After the draw, returns null so the caller keeps the ranked substitute waitlist.
 *
 * lotteryExecutedAt must be an explicit null. A timestamp, or a payload that
 * omitted the field, is not a pre-draw pool.
 */
function lotteryEntrantListCopy(input = {}) {
  if (!input.lotteryEnabled) return null;
  if (input.lotteryExecutedAt !== null) return null;

  const player = lotteryViewerCopy({
    lotteryEnabled: true,
    lotteryPending: !!input.lotteryPending,
    lotteryExecutedAt: null,
    lotteryAt: input.lotteryAt || null,
    viewerParticipationStatus: 'WAITLISTED',
    now: input.now,
  });
  if (!player || (player.kind !== 'pool' && player.kind !== 'drawing')) return null;

  const registeredLabel = lotteryRegisteredLabel(input.count);

  if (player.kind === 'drawing') {
    return {
      kind: 'drawing',
      title: player.title,
      detail: null,
      rowLabel: null,
      registeredLabel,
      showQueuePosition: false,
    };
  }

  return {
    kind: 'pool',
    title: POOL_ALERT_TITLE,
    detail: player.detail,
    rowLabel: POOL_ENTRANT_LABEL,
    registeredLabel,
    showQueuePosition: false,
  };
}

function guestRegistrationOpensAtFromError(error) {
  if (!error || typeof error !== 'object') return null;
  const body = error.body;
  const responseData = error.response && error.response.data;
  const candidates = [
    error.guestRegistrationOpensAt,
    body && body.guestRegistrationOpensAt,
    responseData && responseData.guestRegistrationOpensAt,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

module.exports = {
  lotteryViewerCopy,
  lotteryEntrantListCopy,
  resolveNotSelectedJoinLabel,
  guestRegistrationNotOpenMessage,
  guestRegistrationOpensAtFromError,
  guestJoinClosedLabel,
  isGuestRegistrationClosed,
  formatHebrewWhen,
  DRAWING_TITLE,
};
