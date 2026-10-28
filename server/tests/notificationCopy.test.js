// Every notification copy builder must produce both Hebrew and English — pure, no DB.
jest.mock('../lib/prisma', () => ({ prisma: {} }));

const copy = require('../utils/notificationCopy');

const HEBREW = /[֐-׿]/;
const game = {
  id: 'g1',
  title: 'Friday five-a-side',
  start: '2026-11-06T17:00:00.000Z',
  registrationOpensAt: '2026-11-01T08:00:00.000Z',
  field: { name: 'Park Field', city: 'Haifa' },
};
const match = { homeTeam: { name: 'Reds' }, awayTeam: { name: 'Blues' } };

const CASES = {
  gameJoinedOrganizer: () => copy.gameJoinedOrganizer({ name: null }),
  gameJoinRequestOrganizer: () => copy.gameJoinRequestOrganizer({ name: null }),
  gameWaitlistJoinOrganizer: () => copy.gameWaitlistJoinOrganizer({ name: null }),
  gameWaitlistOffer: () => copy.gameWaitlistOffer(),
  gameJoinApproved: () => copy.gameJoinDecision({ approved: true }),
  gameJoinApprovedLottery: () => copy.gameJoinDecision({ approved: true, enteredLottery: true }),
  gameJoinRejected: () => copy.gameJoinDecision({ approved: false }),
  gameCancelled: () => copy.gameCancelled({ gameTitle: null, when: '06/11/2026 19:00' }),
  gameRemoved: () => copy.gameRemovedPeer({ gameTitle: null }),
  gameBypassed: () => copy.gameRemovedPeer({ gameTitle: null, bypassed: true }),
  friendJoinedGame: () => copy.friendJoinedGame({ name: null, game }),
  friendNewGame: () => copy.friendNewGame({ name: null, game }),
  newGameInCity: () => copy.newGameInCity({ name: null, game }),
  newSeriesGame: () => copy.newSeriesGame({ game }),
  newSeriesGameOpenNow: () => copy.newSeriesGame({ game: { title: null } }),
  seriesJoinRequest: () => copy.seriesJoinRequest({ name: null, groupName: 'Sunday crew' }),
  seriesJoinApproved: () => copy.seriesJoinDecision({ approved: true, groupName: 'Sunday crew' }),
  seriesJoinRejected: () => copy.seriesJoinDecision({ approved: false, groupName: 'Sunday crew' }),
  seriesMemberAdded: () => copy.seriesMemberAdded({ name: null, groupName: 'Sunday crew' }),
  friendRequest: () => copy.friendRequest({ name: null }),
  friendAccepted: () => copy.friendAccepted({ name: null }),
  tournamentTeamInvite: () => copy.tournamentTeamInvite({ name: null, teamName: 'Reds', tournamentTitle: 'Cup' }),
  ...Object.fromEntries(['APPROVED', 'REJECTED', 'WAITLISTED', 'PENDING'].map((status) => [
    `tournamentDecision_${status}`,
    () => copy.tournamentTeamDecision({ status, teamName: 'Reds', tournamentTitle: 'Cup' }),
  ])),
  tournamentMatchScheduledSingle: () => copy.tournamentMatchScheduled({ single: match, whenText: '06/11 19:00', tournamentTitle: 'Cup' }),
  tournamentMatchScheduledMany: () => copy.tournamentMatchScheduled({ single: null, count: 3, firstWhen: '06/11 19:00', tournamentTitle: 'Cup' }),
  tournamentStartingSoon: () => copy.tournamentStartingSoon({ homeName: 'Reds', awayName: 'Blues', time: '19:00', tournamentTitle: 'Cup' }),
};

describe('notification copy builders', () => {
  test.each(Object.keys(CASES))('%s has Hebrew and English copy', (key) => {
    const c = CASES[key]();
    for (const field of ['title', 'body', 'titleEn', 'bodyEn']) {
      expect(typeof c[field]).toBe('string');
      expect(c[field].trim()).not.toBe('');
    }
    expect(HEBREW.test(c.title)).toBe(true);
    // English copy must not leak Hebrew fallback words (user content like names is excluded in these cases).
    expect(HEBREW.test(c.titleEn)).toBe(false);
    expect(HEBREW.test(c.bodyEn)).toBe(false);
  });

  test('enData exposes only the English fields', () => {
    expect(copy.enData(copy.gameWaitlistOffer())).toEqual({
      titleEn: 'A spot opened up!',
      bodyEn: 'A spot opened up in the game! Tap to confirm your place',
    });
  });

  test('a resolved name is used in both languages; a missing one falls back per language', () => {
    const named = copy.friendRequest({ name: 'Dana' });
    expect(named.body).toContain('Dana');
    expect(named.bodyEn).toContain('Dana');
    const anon = copy.friendRequest({ name: null });
    expect(anon.body).toContain('משתמש');
    expect(anon.bodyEn).toContain('Someone');
  });

  test('an unknown tournament decision status yields null', () => {
    expect(copy.tournamentTeamDecision({ status: 'WEIRD', teamName: 'x', tournamentTitle: 'y' })).toBeNull();
  });

  test('Hebrew copy is unchanged for the cancel notification', () => {
    const c = copy.gameCancelled({ gameTitle: 'משחק שישי', when: '06/11/2026 19:00' });
    expect(c.body).toBe('משחק שישי (06/11/2026 19:00) בוטל על ידי המארגן');
  });
});
