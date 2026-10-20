jest.mock('../workers/reviewWorker', () => ({ processReviewQueue: jest.fn() }));
jest.mock('../workers/cleanupWorker', () => ({ startCleanupWorker: jest.fn(), runCleanup: jest.fn() }));

const { prisma, mapListForViewer } = require('../services/gameService');

const future = new Date(Date.now() + 86400000);
const row = (over = {}) => ({
  id: 'g1',
  start: future,
  organizerId: 'org',
  seriesId: null,
  isFriendsOnly: true,
  friendsOnlyUntil: null,
  friendsOnlyLinkPolicy: 'REQUEST_TO_JOIN',
  customLocation: 'secret',
  customLat: 1,
  customLng: 2,
  field: { id: 'f', name: 'F', location: 'addr', city: 'c', lat: 3, lng: 4 },
  participants: [
    { userId: 'org', status: 'CONFIRMED' },
    { userId: 'kid', status: 'CONFIRMED' },
    { userId: 'me', status: 'PENDING', isWaitlistOffer: false },
  ],
  ...over,
});

describe('mapListForViewer', () => {
  beforeEach(() => {
    jest.spyOn(prisma.friendship, 'findMany').mockResolvedValue([]);
    jest.spyOn(prisma.seriesParticipant, 'findMany').mockResolvedValue([]);
    jest.spyOn(prisma.gameRole, 'findMany').mockResolvedValue([]);
  });
  afterEach(() => jest.restoreAllMocks());

  test('a pending outsider gets the card without address or roster', async () => {
    const [d] = await mapListForViewer([row()], 'me');
    expect(d.customLocation).toBeNull();
    expect(d.customLat).toBeNull();
    expect(d.fieldLocation).toBe('');
    expect(d.field.location).toBe('');
    expect(d.field.lat).toBeNull();
    expect(d.participants).toEqual([]);
    expect(d.currentPlayers).toBe(2);
  });

  test('a friend of the organizer keeps the full row', async () => {
    prisma.friendship.findMany.mockResolvedValue([{ userAId: 'me', userBId: 'org' }]);
    const [d] = await mapListForViewer([row()], 'me');
    expect(d.customLocation).toBe('secret');
    expect(d.participants.length).toBe(2);
  });

  test('group member, role holder, organizer, waitlist offer, BLOCKED policy and public games are untouched', async () => {
    prisma.seriesParticipant.findMany.mockResolvedValue([{ seriesId: 's1' }]);
    const [member] = await mapListForViewer([row({ seriesId: 's1' })], 'me');
    expect(member.customLocation).toBe('secret');

    prisma.seriesParticipant.findMany.mockResolvedValue([]);
    prisma.gameRole.findMany.mockResolvedValue([{ gameId: 'g1' }]);
    expect((await mapListForViewer([row()], 'me'))[0].customLocation).toBe('secret');
    prisma.gameRole.findMany.mockResolvedValue([]);

    expect((await mapListForViewer([row({ organizerId: 'me' })], 'me'))[0].customLocation).toBe('secret');
    const offer = row({ participants: [{ userId: 'me', status: 'PENDING', isWaitlistOffer: true }] });
    expect((await mapListForViewer([offer], 'me'))[0].customLocation).toBe('secret');
    expect((await mapListForViewer([row({ friendsOnlyLinkPolicy: 'BLOCKED' })], 'me'))[0].customLocation).toBe('secret');
    expect((await mapListForViewer([row({ isFriendsOnly: false })], 'me'))[0].customLocation).toBe('secret');
  });

  test('a rejected outsider is redacted too; logged-out lists skip the lookup', async () => {
    const rejected = row({ participants: [{ userId: 'me', status: 'REJECTED', isWaitlistOffer: false }] });
    expect((await mapListForViewer([rejected], 'me'))[0].customLocation).toBeNull();
    await mapListForViewer([row({ isFriendsOnly: false })], undefined);
  });
});
