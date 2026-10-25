const {
  lotteryViewerCopy,
  lotteryEntrantListCopy,
  resolveNotSelectedJoinLabel,
  guestRegistrationNotOpenMessage,
  guestRegistrationOpensAtFromError,
  guestJoinClosedLabel,
  isGuestRegistrationClosed,
  formatHebrewWhen,
} = require('./gameViewerCopy');

const DRAW_AT = '2026-10-24T15:00:00.000Z'; // 24/10/2026 18:00 Asia/Jerusalem
const DRAW_WHEN = '24/10/2026 בשעה 18:00';
const BEFORE_DRAW = new Date('2026-10-24T14:00:00.000Z');
const AFTER_DRAW = new Date('2026-10-24T16:00:00.000Z');

describe('lotteryViewerCopy pool (pre-draw)', () => {
  const pool = {
    lotteryEnabled: true,
    lotteryPending: true,
    lotteryAt: DRAW_AT,
    viewerParticipationStatus: 'WAITLISTED',
    now: BEFORE_DRAW,
  };

  it('uses lottery wording, the draw time, and the lottery cancel label', () => {
    expect(lotteryViewerCopy(pool)).toEqual({
      kind: 'pool',
      title: 'נרשמת להגרלה',
      detail: `ההגרלה ב-${DRAW_WHEN}`,
      cancelLabel: 'בטל הרשמה להגרלה',
      canRejoin: false,
      joinMode: null,
      joinLabel: null,
      selectedNote: null,
    });
  });

  it('keeps the lottery title when the draw time is missing', () => {
    const copy = lotteryViewerCopy({ ...pool, lotteryAt: null });
    expect(copy.title).toBe('נרשמת להגרלה');
    expect(copy.detail).toBe('המקומות יוגרלו במועד ההגרלה');
    expect(copy.cancelLabel).toBe('בטל הרשמה להגרלה');
  });

  it('does not use substitute waitlist copy for a pending pool member', () => {
    const copy = lotteryViewerCopy(pool);
    expect(copy.title).not.toContain('המתנה');
    expect(copy.detail).not.toContain('מחליף');
    expect(copy.cancelLabel).not.toContain('מחליף');
  });
});

describe('lotteryEntrantListCopy (organizer roster before the draw)', () => {
  const playerPool = () => lotteryViewerCopy({
    lotteryEnabled: true,
    lotteryPending: true,
    lotteryAt: DRAW_AT,
    viewerParticipationStatus: 'WAITLISTED',
    now: BEFORE_DRAW,
  });

  it('uses the player lottery sentences and no queue position', () => {
    const player = playerPool();
    expect(lotteryEntrantListCopy({
      lotteryEnabled: true,
      lotteryPending: true,
      lotteryExecutedAt: null,
      lotteryAt: DRAW_AT,
      count: 4,
      now: BEFORE_DRAW,
    })).toEqual({
      kind: 'pool',
      title: 'הגרלה ממתינה',
      detail: player.detail,
      rowLabel: 'ממתין להגרלה',
      registeredLabel: 'רשומים: 4',
      showQueuePosition: false,
    });
    expect(player.detail).toBe(`ההגרלה ב-${DRAW_WHEN}`);
  });

  it('does not label the pool as a ranked waitlist', () => {
    const copy = lotteryEntrantListCopy({
      lotteryEnabled: true,
      lotteryPending: true,
      lotteryExecutedAt: null,
      lotteryAt: DRAW_AT,
      count: 4,
    });
    expect(copy.title).not.toContain('רשימת המתנה');
    expect(copy.rowLabel).not.toContain('#');
    expect(copy.showQueuePosition).toBe(false);
    expect(copy.title).not.toBe('נרשמת להגרלה');
  });

  it('keeps the player fallback sentence when the draw time is missing', () => {
    const copy = lotteryEntrantListCopy({
      lotteryEnabled: true,
      lotteryPending: true,
      lotteryExecutedAt: null,
      lotteryAt: null,
      count: 1,
    });
    expect(copy.detail).toBe('המקומות יוגרלו במועד ההגרלה');
    expect(copy.registeredLabel).toBe('רשומים: 1');
  });

  it('uses the player drawing title while the overdue draw has not run', () => {
    expect(lotteryEntrantListCopy({
      lotteryEnabled: true,
      lotteryPending: false,
      lotteryExecutedAt: null,
      lotteryAt: DRAW_AT,
      count: 4,
      now: AFTER_DRAW,
    })).toEqual({
      kind: 'drawing',
      title: 'ההגרלה מתבצעת',
      detail: null,
      rowLabel: null,
      registeredLabel: 'רשומים: 4',
      showQueuePosition: false,
    });
  });

  it('keeps the ranked waitlist after the draw and when this is not a lottery', () => {
    const ran = {
      lotteryEnabled: true,
      lotteryPending: false,
      lotteryExecutedAt: '2026-10-24T15:05:00.000Z',
      lotteryAt: DRAW_AT,
      count: 2,
    };
    expect(lotteryEntrantListCopy(ran)).toBeNull();
    expect(lotteryEntrantListCopy({ ...ran, lotteryExecutedAt: undefined })).toBeNull();
    expect(lotteryEntrantListCopy({
      lotteryEnabled: false,
      lotteryPending: false,
      lotteryExecutedAt: null,
      count: 2,
    })).toBeNull();
    expect(lotteryEntrantListCopy({
      lotteryEnabled: true,
      lotteryPending: false,
      lotteryExecutedAt: null,
      count: 2,
    })).toBeNull();
  });
});

describe('lotteryViewerCopy while the overdue draw has not run', () => {
  it('tells a pool member the draw is in progress instead of the substitute waitlist', () => {
    expect(lotteryViewerCopy({
      lotteryEnabled: true,
      lotteryPending: false,
      lotteryExecutedAt: null,
      lotteryAt: DRAW_AT,
      viewerParticipationStatus: 'WAITLISTED',
      now: AFTER_DRAW,
    })).toEqual({
      kind: 'drawing',
      title: 'ההגרלה מתבצעת',
      detail: null,
      cancelLabel: null,
      canRejoin: false,
      joinMode: null,
      joinLabel: null,
      selectedNote: null,
    });
  });

  it('does not treat a missing executed timestamp as an overdue draw', () => {
    expect(lotteryViewerCopy({
      lotteryEnabled: true,
      lotteryPending: false,
      lotteryAt: DRAW_AT,
      viewerParticipationStatus: 'WAITLISTED',
      now: AFTER_DRAW,
    })).toBeNull();
  });
});

describe('lotteryViewerCopy after the draw', () => {
  it('tells a NOT_SELECTED viewer they missed, and lets them join a free seat', () => {
    expect(lotteryViewerCopy({
      lotteryEnabled: true,
      lotteryPending: false,
      lotteryAt: DRAW_AT,
      viewerParticipationStatus: 'NOT_SELECTED',
      seatsFree: true,
      now: AFTER_DRAW,
    })).toMatchObject({
      kind: 'not_selected',
      title: 'לא נבחרת בהגרלה',
      detail: 'יש מקומות פנויים, אפשר להצטרף למשחק',
      canRejoin: true,
      joinMode: 'join',
      joinLabel: 'הצטרף למשחק',
      cancelLabel: null,
    });
  });

  it('points a NOT_SELECTED viewer at the waitlist when the game is full', () => {
    expect(lotteryViewerCopy({
      lotteryEnabled: true,
      lotteryPending: false,
      viewerParticipationStatus: 'NOT_SELECTED',
      seatsFree: false,
    })).toMatchObject({
      kind: 'not_selected',
      title: 'לא נבחרת בהגרלה',
      detail: 'אין מקום פנוי, אפשר להצטרף לרשימת המתנה',
      joinMode: 'waitlist',
      joinLabel: 'הצטרף לרשימת המתנה',
      canRejoin: true,
    });
  });

  it('adds an optional winner note for a confirmed player after the draw', () => {
    expect(lotteryViewerCopy({
      lotteryEnabled: true,
      lotteryPending: false,
      lotteryAt: DRAW_AT,
      viewerParticipationStatus: 'CONFIRMED',
      now: AFTER_DRAW,
    })).toMatchObject({
      kind: 'selected',
      title: 'נבחרת בהגרלה',
      selectedNote: 'נבחרת בהגרלה',
      cancelLabel: null,
      canRejoin: false,
      joinLabel: null,
    });
  });

  it('does not call a pre-draw confirmed organizer a winner', () => {
    expect(lotteryViewerCopy({
      lotteryEnabled: true,
      lotteryPending: true,
      lotteryAt: DRAW_AT,
      viewerParticipationStatus: 'CONFIRMED',
      now: BEFORE_DRAW,
    })).toBeNull();
  });

  it('does not call an organizer who opted out of the draw a winner', () => {
    expect(lotteryViewerCopy({
      lotteryEnabled: true,
      lotteryPending: false,
      lotteryAt: DRAW_AT,
      viewerParticipationStatus: 'CONFIRMED',
      viewerIsOrganizer: true,
      organizerInLottery: false,
      now: AFTER_DRAW,
    })).toBeNull();
  });
});

describe('lotteryViewerCopy leaves ordinary states alone', () => {
  it('returns null for a real waitlist after the draw', () => {
    expect(lotteryViewerCopy({
      lotteryEnabled: true,
      lotteryPending: false,
      lotteryExecutedAt: DRAW_AT,
      lotteryAt: DRAW_AT,
      viewerParticipationStatus: 'WAITLISTED',
      now: AFTER_DRAW,
    })).toBeNull();
  });

  it('returns null when the game has no lottery', () => {
    expect(lotteryViewerCopy({
      lotteryEnabled: false,
      lotteryPending: false,
      viewerParticipationStatus: 'WAITLISTED',
    })).toBeNull();
    expect(lotteryViewerCopy({
      viewerParticipationStatus: 'CONFIRMED',
    })).toBeNull();
  });
});

describe('formatHebrewWhen', () => {
  it('guards DD/MM/YYYY and 24-hour Jerusalem time, day before month', () => {
    expect(formatHebrewWhen(DRAW_AT)).toBe('24/10/2026 בשעה 18:00');
    // 1 Dec 16:00Z is 18:00 in Jerusalem (UTC+2). Month-first would be 12/01.
    expect(formatHebrewWhen('2026-12-01T16:00:00.000Z')).toBe('01/12/2026 בשעה 18:00');
    expect(formatHebrewWhen('not-a-date')).toBeNull();
    expect(formatHebrewWhen(null)).toBeNull();
  });
});

describe('resolveNotSelectedJoinLabel', () => {
  const missed = (seatsFree) => lotteryViewerCopy({
    lotteryEnabled: true,
    lotteryPending: false,
    viewerParticipationStatus: 'NOT_SELECTED',
    seatsFree,
  });

  it('uses join or waitlist when approval is not required', () => {
    expect(resolveNotSelectedJoinLabel(missed(true), { requiresApproval: false })).toBe('הצטרף למשחק');
    expect(resolveNotSelectedJoinLabel(missed(false), { requiresApproval: false })).toBe('הצטרף לרשימת המתנה');
  });

  it('falls back to the request label when approval is required', () => {
    expect(resolveNotSelectedJoinLabel(missed(true), { requiresApproval: true })).toBe('בקש להצטרף');
    expect(resolveNotSelectedJoinLabel(missed(false), { requiresApproval: true })).toBe('בקש להצטרף');
  });

  it('returns null outside the not-selected state', () => {
    expect(resolveNotSelectedJoinLabel(null, { requiresApproval: true })).toBeNull();
    expect(resolveNotSelectedJoinLabel(
      lotteryViewerCopy({ lotteryEnabled: true, lotteryPending: true, lotteryAt: DRAW_AT, viewerParticipationStatus: 'WAITLISTED' }),
      { requiresApproval: true },
    )).toBeNull();
  });
});

describe('guest join button before the guest window', () => {
  const opensAt = DRAW_AT;

  it('closes the button only for a known guest before the opening time', () => {
    expect(isGuestRegistrationClosed({
      viewerIsInsider: false,
      guestRegistrationOpensAt: opensAt,
      now: BEFORE_DRAW,
    })).toBe(true);
    expect(guestJoinClosedLabel(opensAt)).toBe(`נפתח ב-${DRAW_WHEN}`);
  });

  it('stays open for insiders, unknown viewers, and after the window', () => {
    expect(isGuestRegistrationClosed({
      viewerIsInsider: true,
      guestRegistrationOpensAt: opensAt,
      now: BEFORE_DRAW,
    })).toBe(false);
    expect(isGuestRegistrationClosed({
      guestRegistrationOpensAt: opensAt,
      now: BEFORE_DRAW,
    })).toBe(false);
    expect(isGuestRegistrationClosed({
      viewerIsInsider: false,
      guestRegistrationOpensAt: opensAt,
      now: AFTER_DRAW,
    })).toBe(false);
    expect(isGuestRegistrationClosed({ viewerIsInsider: false, now: BEFORE_DRAW })).toBe(false);
    expect(guestJoinClosedLabel(null)).toBe('ההרשמה לאורחים טרם נפתחה');
    expect(guestJoinClosedLabel('not-a-date')).toBe('ההרשמה לאורחים טרם נפתחה');
  });
});

describe('guest registration closed copy', () => {
  const base = 'ההרשמה לאורחים טרם נפתחה - חברי הקבוצה נרשמים ראשונים';

  it('stays the base sentence when the server sends no opening time', () => {
    expect(guestRegistrationNotOpenMessage(null)).toBe(base);
    expect(guestRegistrationNotOpenMessage('')).toBe(base);
    expect(guestRegistrationNotOpenMessage('not-a-date')).toBe(base);
  });

  it('includes the Jerusalem opening time when the server returns one', () => {
    expect(guestRegistrationNotOpenMessage(DRAW_AT)).toBe(`${base}. נפתחת ב-${DRAW_WHEN}`);
  });

  it('reads guestRegistrationOpensAt from the API error body', () => {
    const error = Object.assign(new Error('Registration is not yet open for guests'), {
      status: 400,
      code: 'GUEST_REGISTRATION_NOT_OPEN',
      body: { guestRegistrationOpensAt: DRAW_AT },
    });
    expect(guestRegistrationOpensAtFromError(error)).toBe(DRAW_AT);
    expect(guestRegistrationNotOpenMessage(guestRegistrationOpensAtFromError(error))).toContain(DRAW_WHEN);
  });

  it('reads a top-level guestRegistrationOpensAt and ignores empty errors', () => {
    expect(guestRegistrationOpensAtFromError({ guestRegistrationOpensAt: DRAW_AT })).toBe(DRAW_AT);
    expect(guestRegistrationOpensAtFromError(null)).toBeNull();
    expect(guestRegistrationOpensAtFromError(new Error('nope'))).toBeNull();
  });
});
