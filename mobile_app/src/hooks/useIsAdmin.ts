import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { usersApi } from '@/services/api/users';
import { useAuthTokenRef } from './useAuthTokenRef';

export type IsAdminStatus = 'loading' | 'signed-out' | 'denied' | 'allowed';

/**
 * Mirrors next_app's useIsAdmin hook (next_app/src/hooks/useIsAdmin.ts). `isAdmin`
 * always originates from usersApi.getMe()'s server response -- this hook only
 * moves where that call happens, it never determines admin status itself.
 */
export function useIsAdmin() {
    const { isLoaded, isSignedIn } = useAuth();
    const getTokenRef = useAuthTokenRef();
    const [status, setStatus] = useState<IsAdminStatus>('loading');

    const refresh = useCallback(async () => {
        if (!isLoaded) return;
        if (!isSignedIn) {
            setStatus('signed-out');
            return;
        }
        setStatus('loading');
        try {
            const token = await getTokenRef.current();
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
        // getTokenRef is a ref object -- its identity never changes, so it's safe here
        // without retriggering this callback (and the effect below) on every render,
        // unlike Clerk's getToken function itself (see useAuthTokenRef.ts).
    }, [isLoaded, isSignedIn, getTokenRef]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return { status, isAdmin: status === 'allowed', refresh };
}
