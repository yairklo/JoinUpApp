import type { ManageOverview, ManagedGame, ManagedGroup } from '@/services/api/manage';

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
