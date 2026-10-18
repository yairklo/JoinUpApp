import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { usersApi } from '@/services/api/users';

/**
 * The current user's avatar, from our DB (users/me.imageUrl) rather than Clerk, so an upload from
 * any client shows up everywhere. Module-level so every screen shares one fetch and one value;
 * `set` lets the profile screen update all consumers right after an upload/remove.
 */
type Store = { userId: string | null; imageUrl: string | null | undefined; name: string | null | undefined; loading: boolean };

let store: Store = { userId: null, imageUrl: undefined, name: undefined, loading: false };
const listeners = new Set<() => void>();

const update = (next: Partial<Store>) => {
    store = { ...store, ...next };
    listeners.forEach(l => l());
};
const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => { listeners.delete(l); };
};
const getSnapshot = () => store;

/** Call after the current user's name was saved so every screen shows it immediately. */
export function setMyName(name: string | null) {
    if (store.userId) update({ name });
}

/** The current user's name: DB value, with Clerk's only as a fallback while loading / when empty. */
export function useMyName(): string {
    const { user } = useUser();
    const { name } = useMyAvatar();
    return name?.trim() || user?.fullName?.trim() || '';
}

export function useMyAvatar() {
    const { user } = useUser();
    const { getToken } = useAuth();
    const userId = user?.id ?? null;
    const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    const refresh = useCallback(async () => {
        if (!userId) return;
        update({ loading: true });
        try {
            const token = await getToken();
            if (!token) return;
            const me = await usersApi.getMe(token);
            if (store.userId === userId) update({ imageUrl: me.imageUrl ?? null, name: me.name ?? null });
        } catch (err) {
            console.error('Failed to load avatar', err);
        } finally {
            update({ loading: false });
        }
    }, [userId, getToken]);

    const set = useCallback((imageUrl: string | null) => update({ userId, imageUrl }), [userId]);

    useEffect(() => {
        if (!userId) {
            if (store.userId) update({ userId: null, imageUrl: undefined, name: undefined });
            return;
        }
        if (store.userId !== userId) {
            update({ userId, imageUrl: undefined, name: undefined });
            void refresh();
        }
    }, [userId, refresh]);

    const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent((snap.userId === userId && snap.name) || user?.fullName || '')}`;
    const own = snap.userId === userId ? snap.imageUrl : undefined;
    // null = DB says no photo (don't fall back to a stale Clerk image); undefined = not loaded yet.
    const imageUrl = own === null ? fallback : own || user?.imageUrl || fallback;
    const hasImage = own === null ? false : !!(own || user?.hasImage);

    const name = snap.userId === userId ? snap.name : undefined;

    return { imageUrl, hasImage, hasDbImage: !!own, name, refresh, set };
}
