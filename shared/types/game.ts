export type GameParticipant = {
    id: string;
    name?: string | null;
    avatar?: string | null;
    teamId?: string | null;
    status?: 'CONFIRMED' | 'WAITLISTED';
};

export type Team = {
    id: string;
    name: string;
    color: string;
    playerIds: string[];
    managerId?: string | null;
};

export type Manager = {
    id: string;
    name?: string | null;
    avatar?: string | null;
    role: string;
};

export type GameField = {
    id?: string;
    lat?: number | null;
    lng?: number | null;
    name?: string;
    location?: string;
    city?: string | null;
    image?: string | null;
};

export type JoinRequest = {
    userId: string;
    name?: string | null;
    avatar?: string | null;
    requestedAt: string;
    status?: string;
    isWaitlistOffer?: boolean;
    queuePosition?: number;
};

export type Game = {
    id: string;
    fieldId: string;
    fieldName: string;
    fieldLocation: string;
    city?: string | null;
    start?: string;
    date: string;
    time: string;
    duration?: number;
    maxPlayers: number;
    currentPlayers: number;
    participants?: GameParticipant[];
    sport?: string;
    seriesId?: string | null;
    registrationOpensAt?: string | null;
    title?: string | null;
    description?: string | null;
    welcomeMessage?: string | null;
    teamSize?: number | null;
    price?: number | null;
    organizerId?: string;
    fieldLat?: number | null;
    fieldLng?: number | null;
    customLat?: number | null;
    customLng?: number | null;
    customLocation?: string | null;
    isFriendsOnly?: boolean;
    friendsOnlyUntil?: string | null;
    joinPolicy?: 'INSTANT' | 'REQUIRES_APPROVAL';
    pendingRequestCount?: number;
    viewerParticipationStatus?: 'PENDING' | 'CONFIRMED' | 'WAITLISTED' | 'REJECTED' | null;
    waitlistCount?: number;
    waitlistParticipants?: GameParticipant[];
    waitlistOfferPending?: boolean;
    lotteryEnabled?: boolean;
    lotteryAt?: string | null;
    lotteryPending?: boolean;
    overbooked?: boolean;
    totalSignups?: number;
    organizerInLottery?: boolean;
    pickDrawAt?: string | null;
    pickingStartsAt?: string | null;
    pickSessionStatus?: string;
    pickTurnOrder?: string[];
    managerPickChatId?: string | null;
    teams?: Team[];
    managers?: Manager[];
    draftingManagerIds?: string[];
    status?: string;
    chatRoomId?: string;
    isOpenToJoin?: boolean;
    isTeamFull?: boolean;
    isJoined?: boolean;
    field?: GameField;
};
