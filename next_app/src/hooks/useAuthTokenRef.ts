import { useEffect, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';

/** Stable ref for Clerk getToken — avoids effect loops from unstable function identity. */
export function useAuthTokenRef() {
    const { getToken } = useAuth();
    const getTokenRef = useRef(getToken);

    useEffect(() => {
        getTokenRef.current = getToken;
    }, [getToken]);

    return getTokenRef;
}
