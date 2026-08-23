import type { Field } from '@/services/api/fields';

export type Game = {
    id: string;
    field?: Field;
    title?: string | null;
    fieldId: string;
    fieldName: string;
    fieldLocation: string;
    city?: string | null;
    date: string;
    time: string;
    start?: string; // Often returned in mapGameForClient (ISO string)
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
    welcomeMessage?: string;
    isFriendsOnly?: boolean;
    friendsOnlyUntil?: string | null;
    joinPolicy?: 'INSTANT' | 'REQUIRES_APPROVAL';
    pendingRequestCount?: number;
    waitlistCount?: number;
    viewerParticipationStatus?: 'CONFIRMED' | 'WAITLISTED' | 'PENDING' | 'REJECTED' | null;
    isOpenToJoin?: boolean;
    lotteryEnabled?: boolean;
    lotteryAt?: string | null;
    organizerInLottery?: boolean;
    waitlistOfferPending?: boolean;
    pickDrawAt?: string | null;
    pickingStartsAt?: string | null;
    pickSessionStatus?: string;
    pickTurnOrder?: string[];
    managerPickChatId?: string | null;

    // Computed/Client-side logic might add these
    isTeamFull?: boolean;
    isJoined?: boolean;

    teams?: Team[];
    managers?: Manager[];
    draftingManagerIds?: string[];
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
    status?: string;
    isWaitlistOffer?: boolean;
    queuePosition?: number;
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
