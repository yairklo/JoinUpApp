import { useEffect, useRef } from 'react';
import { useAuth } from '@clerk/clerk-expo';

/** Stable ref for Clerk getToken — avoids effect loops from unstable function identity. */
export function useAuthTokenRef() {
    const { getToken } = useAuth();
    const getTokenRef = useRef(getToken);

    useEffect(() => {
        getTokenRef.current = getToken;
    }, [getToken]);

    return getTokenRef;
}

/**
 * Returns a function that is true once the user was signed in while this screen was mounted and
 * has since signed out. Screens left behind in the stack refetch after sign-out and get 401 —
 * that must not raise an error alert over the sign-in screen. Real errors for signed-in users
 * (and guests who never had a session) are unaffected.
 */
export function useSignedOutSinceMount() {
    const { isSignedIn } = useAuth();
    const wasSignedIn = useRef(false);
    const signedNow = useRef(!!isSignedIn);
    if (isSignedIn) wasSignedIn.current = true;
    signedNow.current = !!isSignedIn;
    return useRef(() => wasSignedIn.current && !signedNow.current).current;
}
