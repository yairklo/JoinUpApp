import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { usersApi } from '@/services/api/users';

export type IsAdminStatus = 'loading' | 'signed-out' | 'denied' | 'allowed';

/**
 * Shared client-side admin gate. Consolidates the getToken -> usersApi.getMe(token) ->
 * isAdmin check that used to be duplicated across admin/fields, admin/moderation and
 * profile/settings. `isAdmin` always originates from usersApi.getMe()'s server response
 * (Clerk metadata / ADMIN_USER_IDS on the server) -- this hook only moves where that call
 * happens, it never determines admin status itself.
 */
export function useIsAdmin() {
    const { getToken, isLoaded, isSignedIn } = useAuth();
    const [status, setStatus] = useState<IsAdminStatus>('loading');

    const refresh = useCallback(async () => {
        if (!isLoaded) return;
        if (!isSignedIn) {
            setStatus('signed-out');
            return;
        }
        setStatus('loading');
        try {
            const token = await getToken();
            if (!token) {
                setStatus('signed-out');
                return;
            }
            const me = await usersApi.getMe(token);
            setStatus(me.isAdmin ? 'allowed' : 'denied');
        } catch (e) {
            console.error(e);
            setStatus('denied');
        }
    }, [isLoaded, isSignedIn, getToken]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return { status, isAdmin: status === 'allowed', refresh };
}
