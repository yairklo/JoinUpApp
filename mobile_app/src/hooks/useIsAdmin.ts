import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { usersApi } from '@/services/api/users';

export type IsAdminStatus = 'loading' | 'signed-out' | 'denied' | 'allowed';

/**
 * Mirrors next_app's useIsAdmin hook (next_app/src/hooks/useIsAdmin.ts). `isAdmin`
 * always originates from usersApi.getMe()'s server response -- this hook only
 * moves where that call happens, it never determines admin status itself.
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
