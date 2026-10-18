import { useEffect, useSyncExternalStore } from 'react';
import { useAuth, useUser } from '@clerk/nextjs';
import { usersApi } from '@/services/api/users';
import { resolveMyName } from '@/lib/resolveMyName';

/**
 * The current user's display profile (name, avatar) from our DB, which is the source of truth;
 * Clerk's own values are only fallbacks while loading / when unset. Module-level so every
 * consumer shares one fetch and one value, and the profile screen can push updates after a save.
 */
type Store = { userId: string | null; name: string | null | undefined; imageUrl: string | null | undefined };

let store: Store = { userId: null, name: undefined, imageUrl: undefined };
let inflightFor: string | null = null;
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

/** Call after the current user's avatar was uploaded (url) or removed (null) so open headers refresh. */
export function notifyAvatarChanged(url: string | null) {
    update({ imageUrl: url });
}

/** Call after the current user's name was saved so every screen shows it immediately. */
export function notifyNameChanged(name: string | null) {
    update({ name });
}

function useMyProfileStore() {
    const { getToken, isLoaded, isSignedIn } = useAuth();
    const { user } = useUser();
    const userId = user?.id ?? null;
    const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    useEffect(() => {
        if (!isLoaded || !isSignedIn || !userId) {
            if (isLoaded && store.userId) update({ userId: null, name: undefined, imageUrl: undefined });
            return;
        }
        if (store.userId === userId || inflightFor === userId) return;
        inflightFor = userId;
        update({ userId, name: undefined, imageUrl: undefined });
        (async () => {
            try {
                const token = await getToken();
                if (!token) return;
                const me = await usersApi.getMe(token);
                if (store.userId === userId) update({ name: me.name || null, imageUrl: me.imageUrl || null });
            } catch (e) {
                console.error('Failed to load profile', e);
            } finally {
                inflightFor = null;
            }
        })();
    }, [isLoaded, isSignedIn, userId, getToken]);

    return { user, own: snap.userId === userId ? snap : null };
}

export function useMyAvatar(): string | null {
    const { user, own } = useMyProfileStore();
    if (own?.imageUrl) return own.imageUrl;
    if (own?.imageUrl === null) return null;
    return user?.hasImage ? user.imageUrl : null;
}

export function useMyName(): string {
    const { user, own } = useMyProfileStore();
    return resolveMyName(own?.name, user?.fullName);
}
