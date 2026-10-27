export type PersonLike = {
    id: string;
    name?: string | null;
    imageUrl?: string | null;
    avatar?: string | null;
    friendshipStatus?: string;
};

const byName = (a: PersonLike, b: PersonLike) => (a.name || '').localeCompare(b.name || '', 'he');

/** Friends the manager can still add: deduped, minus excluded ids, sorted by display name. */
export function friendSuggestions<T extends PersonLike>(friends: T[], excludeIds: Set<string>): T[] {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const f of friends) {
        if (!f?.id || excludeIds.has(f.id) || seen.has(f.id)) continue;
        seen.add(f.id);
        out.push(f);
    }
    return out.sort(byName);
}

/**
 * Search results with friends first. A friend counts if the user's friends list matches the query
 * or the search result itself says so; friends the search missed are still shown.
 */
export function mergeFriendsFirst<T extends PersonLike>(
    results: T[],
    friends: T[],
    query: string,
    excludeIds: Set<string>,
): Array<T & { isFriend: boolean }> {
    const q = query.trim().toLowerCase();
    const friendIds = new Set(friends.map((f) => f.id));
    const matchingFriends = friendSuggestions(friends, excludeIds)
        .filter((f) => (f.name || '').toLowerCase().includes(q))
        .map((f) => ({ ...f, isFriend: true }));
    const taken = new Set(matchingFriends.map((f) => f.id));
    const rest: Array<T & { isFriend: boolean }> = [];
    const extraFriends: Array<T & { isFriend: boolean }> = [];
    for (const r of results) {
        if (!r?.id || excludeIds.has(r.id) || taken.has(r.id)) continue;
        taken.add(r.id);
        const isFriend = friendIds.has(r.id) || r.friendshipStatus === 'friends';
        (isFriend ? extraFriends : rest).push({ ...r, isFriend });
    }
    return [...matchingFriends, ...extraFriends, ...rest];
}
