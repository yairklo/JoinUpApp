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

export type ManageItem =
    | { kind: 'group'; key: string; start: number; group: ManagedGroup }
    | { kind: 'game'; key: string; start: number; game: ManagedGame };

/**
 * One list for groups and single games, ordered by the next game that will actually be played.
 * A group has no date of its own, so it sorts by its next game; a group with none scheduled goes last.
 */
export function buildManageItems(overview: ManageOverview | null): ManageItem[] {
    if (!overview) return [];
    const items: ManageItem[] = [
        ...overview.groups.map((group): ManageItem => ({
            kind: 'group',
            key: `g-${group.id}`,
            start: group.nextGame ? Date.parse(group.nextGame.start) : Number.POSITIVE_INFINITY,
            group,
        })),
        ...overview.games.map((game): ManageItem => ({
            kind: 'game',
            key: `m-${game.id}`,
            start: Date.parse(game.start),
            game,
        })),
    ];
    return items.sort((a, b) => a.start - b.start);
}

export const manageApi = {
    overview: (token: string, signal?: AbortSignal) =>
        apiClient<ManageOverview>('/api/manage/overview', { token, signal }),
};
