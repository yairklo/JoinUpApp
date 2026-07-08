export type Game = {
    id: string;
    field?: any; // ToDo: Define Field type
    title?: string | null;
    fieldId: string;
    fieldName: string;
    fieldLocation: string;
    city?: string | null;
    date: string;
    time: string;
    duration?: number;
    fieldLat?: number | null;
    fieldLng?: number | null;
    customLat?: number | null;
    customLng?: number | null;
    customLocation?: string | null;
    maxPlayers: number;
    currentPlayers: number;
    participants?: GameParticipant[];
    sport?: string;
    seriesId?: string | null;
    registrationOpensAt?: string | null;
    teamSize?: number | null;
    price?: number | null;
    organizerId?: string;
    description?: string;
    isFriendsOnly?: boolean;
    friendsOnlyUntil?: string | null;
    joinPolicy?: 'INSTANT' | 'REQUIRES_APPROVAL';
    pendingRequestCount?: number;
    viewerParticipationStatus?: 'CONFIRMED' | 'WAITLISTED' | 'PENDING' | 'REJECTED' | null;
    isOpenToJoin?: boolean;
    lotteryEnabled?: boolean;
    lotteryAt?: string | null;
    organizerInLottery?: boolean;

    // Computed/Client-side logic might add these
    isTeamFull?: boolean;
    isJoined?: boolean;

    teams?: Team[];
    managers?: Manager[];
    waitlistParticipants?: GameParticipant[];
    status?: string;

    chatRoomId?: string; // Links to the ChatRoom
};

export type GameParticipant = {
    id: string;
    name?: string | null;
    avatar?: string | null; // or image? Backend sends 'avatar'
    teamId?: string | null;
    status?: 'CONFIRMED' | 'WAITLISTED';
};

export type JoinRequest = {
    userId: string;
    name?: string | null;
    avatar?: string | null;
    requestedAt: string;
};

export type Team = {
    id: string;
    name: string;
    color: string;
    playerIds: string[];
};

export type Manager = {
    id: string;
    name?: string | null;
    avatar?: string | null;
    role: string;
};
