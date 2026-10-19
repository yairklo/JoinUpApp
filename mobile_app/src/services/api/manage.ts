import { apiClient } from './client';

export type ManageRole = 'ORGANIZER' | 'MANAGER';

export interface ManagedGame {
    id: string;
    title: string | null;
    start: string;
    duration: number;
    sport: string;
    fieldName: string;
    maxPlayers: number;
    confirmedCount: number;
    waitlistCount: number;
    pendingCount: number;
    seriesId: string | null;
    role: ManageRole;
}

export interface ManagedGroup {
    id: string;
    name: string;
    title: string | null;
    fieldName: string;
    dayOfWeek: number | null;
    time: string;
    sport: string;
    imageUrl: string | null;
    role: ManageRole;
    memberCount: number;
    pendingRequestCount: number;
    nextGame: ManagedGame | null;
}

export interface ManageAttentionItem {
    type: 'PENDING_REQUESTS' | 'WAITLIST';
    gameId: string;
    seriesId: string | null;
    count: number;
    start: string;
}

export interface ManageOverview {
    groups: ManagedGroup[];
    games: ManagedGame[];
    attention: ManageAttentionItem[];
}

export const manageApi = {
    overview: (token: string, signal?: AbortSignal) =>
        apiClient<ManageOverview>('/api/manage/overview', { token, signal }),
};
