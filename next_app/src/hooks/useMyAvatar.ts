import { useCallback, useEffect, useState } from 'react';
import { useAuth, useUser } from '@clerk/nextjs';
import { usersApi } from '@/services/api/users';

const AVATAR_CHANGED_EVENT = 'joinup:avatar-changed';

/** Call after the current user's avatar was uploaded (url) or removed (null) so open headers refresh. */
export function notifyAvatarChanged(url: string | null) {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent<string | null>(AVATAR_CHANGED_EVENT, { detail: url }));
}

/**
 * The current user's avatar. Our DB imageUrl is the source of truth (Clerk's own image is only a
 * fallback while loading / when none is set), so uploads from any client show up in the header.
 */
export function useMyAvatar(): string | null {
    const { getToken, isLoaded, isSignedIn } = useAuth();
    const { user } = useUser();
    // undefined = not loaded yet; null = loaded, user has no DB avatar.
    const [dbUrl, setDbUrl] = useState<string | null | undefined>(undefined);

    const load = useCallback(async () => {
        try {
            const token = await getToken();
            if (!token) return;
            const me = await usersApi.getMe(token);
            setDbUrl(me.imageUrl || null);
        } catch (e) {
            console.error('Failed to load avatar', e);
        }
    }, [getToken]);

    useEffect(() => {
        if (isLoaded && isSignedIn) load();
    }, [isLoaded, isSignedIn, load]);

    useEffect(() => {
        const onChange = (e: Event) => setDbUrl((e as CustomEvent<string | null>).detail ?? null);
        window.addEventListener(AVATAR_CHANGED_EVENT, onChange);
        return () => window.removeEventListener(AVATAR_CHANGED_EVENT, onChange);
    }, []);

    if (dbUrl) return dbUrl;
    if (dbUrl === null) return null;
    return user?.hasImage ? user.imageUrl : null;
}
