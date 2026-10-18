import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { usersApi } from '@/services/api/users';

/**
 * The current user's avatar, from our DB (users/me.imageUrl) rather than Clerk, so an upload from
 * any client shows up everywhere. Module-level so every screen shares one fetch and one value;
 * `set` lets the profile screen update all consumers right after an upload/remove.
 */
type Store = { userId: string | null; imageUrl: string | null | undefined; loading: boolean };

let store: Store = { userId: null, imageUrl: undefined, loading: false };
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
            if (store.userId === userId) update({ imageUrl: me.imageUrl ?? null });
        } catch (err) {
            console.error('Failed to load avatar', err);
        } finally {
            update({ loading: false });
        }
    }, [userId, getToken]);

    const set = useCallback((imageUrl: string | null) => update({ userId, imageUrl }), [userId]);

    useEffect(() => {
        if (!userId) {
            if (store.userId) update({ userId: null, imageUrl: undefined });
            return;
        }
        if (store.userId !== userId) {
            update({ userId, imageUrl: undefined });
            void refresh();
        }
    }, [userId, refresh]);

    const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.fullName || '')}`;
    const own = snap.userId === userId ? snap.imageUrl : undefined;
    // null = DB says no photo (don't fall back to a stale Clerk image); undefined = not loaded yet.
    const imageUrl = own === null ? fallback : own || user?.imageUrl || fallback;
    const hasImage = own === null ? false : !!(own || user?.hasImage);

    return { imageUrl, hasImage, hasDbImage: !!own, refresh, set };
}
