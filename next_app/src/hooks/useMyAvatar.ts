import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useAuth, useUser } from '@clerk/nextjs';
import { usersApi } from '@/services/api/users';

/**
 * The current user's avatar, from our DB (users/me.imageUrl) rather than Clerk, so an upload from
 * any client shows up everywhere. Module-level store: every consumer (header, chat, ...) shares one
 * fetch and one value, and `notifyAvatarChanged` updates them all right after an upload/remove.
 */
type Store = { userId: string | null; imageUrl: string | null | undefined };

let store: Store = { userId: null, imageUrl: undefined };
const listeners = new Set<() => void>();

const update = (next: Partial<Store>) => {
    store = { ...store, ...next };
    listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => { listeners.delete(l); };
};
const getSnapshot = () => store;
const getServerSnapshot = (): Store => ({ userId: null, imageUrl: undefined });

/** Call after the current user's avatar was uploaded (url) or removed (null). */
export function notifyAvatarChanged(url: string | null) {
    update({ imageUrl: url });
}

/** Returns the avatar URL, or null when the user has none (render initials). */
export function useMyAvatar(): string | null {
    const { getToken, isLoaded, isSignedIn } = useAuth();
    const { user } = useUser();
    const userId = user?.id ?? null;
    const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    const load = useCallback(async (forUserId: string) => {
        try {
            const token = await getToken();
            if (!token) return;
            const me = await usersApi.getMe(token);
            // Ignore the response if the signed-in user changed, or an upload already updated it.
            if (store.userId === forUserId && store.imageUrl === undefined) update({ imageUrl: me.imageUrl || null });
        } catch (e) {
            console.error('Failed to load avatar', e);
        }
    }, [getToken]);

    useEffect(() => {
        if (!isLoaded) return;
        if (!isSignedIn || !userId) {
            if (store.userId) update({ userId: null, imageUrl: undefined });
            return;
        }
        if (store.userId !== userId) {
            update({ userId, imageUrl: undefined });
            void load(userId);
        }
    }, [isLoaded, isSignedIn, userId, load]);

    const own = snap.userId === userId ? snap.imageUrl : undefined;
    if (own) return own;
    if (own === null) return null; // DB says no photo: don't fall back to a stale Clerk image
    return user?.hasImage ? user.imageUrl : null; // not loaded yet
}
