import { useEffect, useSyncExternalStore } from 'react';
import { useAuth, useUser } from '@clerk/nextjs';
import { usersApi } from '@/services/api/users';
import { createProfileStore } from '@/lib/profileStore';
import { resolveMyName } from '@/lib/resolveMyName';

/**
 * The current user's display profile (name, avatar) from our DB, which is the source of truth;
 * Clerk's own values are only fallbacks while loading. Module-level store: every consumer shares
 * one fetch and one value, and the profile screen pushes updates right after a save/upload.
 */
const store = createProfileStore();

/** Call after the current user's avatar was uploaded (url) or removed (null). */
export const notifyAvatarChanged = store.setAvatar;
/** Call after the current user's name was saved. */
export const notifyNameChanged = store.setName;

function useMyProfile() {
    const { getToken, isLoaded, isSignedIn } = useAuth();
    const { user } = useUser();
    const userId = user?.id ?? null;
    const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);

    useEffect(() => {
        if (!isLoaded) return;
        if (!isSignedIn || !userId) {
            store.signOut();
            return;
        }
        if (!store.signIn(userId)) return;
        (async () => {
            try {
                const token = await getToken();
                if (!token) return store.loadFailed(userId);
                store.applyLoaded(userId, await usersApi.getMe(token));
            } catch (e) {
                console.error('Failed to load profile', e);
                store.loadFailed(userId);
            }
        })();
    }, [isLoaded, isSignedIn, userId, snap.userId, getToken]);

    return { user, own: snap.userId === userId ? snap : null };
}

/** Returns the avatar URL, or null when the user has none (render initials). */
export function useMyAvatar(): string | null {
    const { user, own } = useMyProfile();
    if (own?.imageUrl) return own.imageUrl;
    if (own?.imageUrl === null) return null; // DB says no photo: don't fall back to a stale Clerk image
    return user?.hasImage ? user.imageUrl : null; // not loaded yet
}

export function useMyName(): string {
    const { user, own } = useMyProfile();
    return resolveMyName(own?.name, user?.fullName);
}
