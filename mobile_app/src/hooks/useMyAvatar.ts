import { useEffect, useSyncExternalStore } from 'react';
import { useUser } from '@clerk/clerk-expo';
import { usersApi } from '@/services/api/users';
import { createProfileStore } from '@/lib/profileStore';
import { useAuthTokenRef } from './useAuthTokenRef';

/**
 * The current user's display profile (name, avatar) from our DB (users/me), which is the source of
 * truth; Clerk's own values are only fallbacks while loading. Same store semantics as the web
 * hook (next_app/src/hooks/useMyAvatar.ts): one shared fetch and value, updated right after a
 * save/upload via notifyAvatarChanged / notifyNameChanged.
 */
const store = createProfileStore();

/** Call after the current user's avatar was uploaded (url) or removed (null). */
export const notifyAvatarChanged = store.setAvatar;
/** Call after the current user's name was saved. */
export const notifyNameChanged = store.setName;

function useMyProfile() {
    const { user } = useUser();
    const getTokenRef = useAuthTokenRef();
    const userId = user?.id ?? null;
    const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);

    useEffect(() => {
        if (!userId) {
            store.signOut();
            return;
        }
        if (!store.signIn(userId)) return;
        (async () => {
            try {
                const token = await getTokenRef.current();
                if (!token) return store.loadFailed(userId);
                store.applyLoaded(userId, await usersApi.getMe(token));
            } catch (err) {
                console.error('Failed to load profile', err);
                store.loadFailed(userId);
            }
        })();
    }, [userId, snap.userId, getTokenRef]);

    return { user, own: snap.userId === userId ? snap : null };
}

export function useMyAvatar() {
    const { user, own } = useMyProfile();
    const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(own?.name || user?.fullName || '')}`;
    // null = DB says no photo (don't fall back to a stale Clerk image); undefined = not loaded yet.
    const imageUrl = own?.imageUrl === null ? fallback : own?.imageUrl || user?.imageUrl || fallback;
    const hasImage = own?.imageUrl === null ? false : !!(own?.imageUrl || user?.hasImage);
    return { imageUrl, hasImage };
}

export function useMyName(): string {
    const { user, own } = useMyProfile();
    return own?.name?.trim() || user?.fullName?.trim() || '';
}
