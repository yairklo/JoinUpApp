/**
 * Framework-free store for the current user's display profile (name, avatar) from our DB.
 * Kept identical in next_app/src/lib and mobile_app/src/lib (mobile cannot import from next_app);
 * tests live in next_app. `undefined` = not loaded yet, `null` = loaded and empty.
 */
export type ProfileState = {
    userId: string | null;
    name: string | null | undefined;
    imageUrl: string | null | undefined;
};

export type LoadedProfile = { name?: string | null; imageUrl?: string | null };

export const INITIAL_PROFILE: ProfileState = { userId: null, name: undefined, imageUrl: undefined };

const needsLoad = (s: ProfileState) => s.name === undefined || s.imageUrl === undefined;

export function createProfileStore(retryMs = 15_000, schedule: (fn: () => void, ms: number) => unknown = setTimeout) {
    let state: ProfileState = INITIAL_PROFILE;
    const listeners = new Set<() => void>();

    const update = (next: Partial<ProfileState>) => {
        state = { ...state, ...next };
        listeners.forEach((l) => l());
    };

    return {
        subscribe(l: () => void) {
            listeners.add(l);
            return () => { listeners.delete(l); };
        },
        getSnapshot: () => state,
        // Stable reference, as useSyncExternalStore requires for the server snapshot.
        getServerSnapshot: () => INITIAL_PROFILE,

        /** Call after the avatar was uploaded (url) or removed (null). */
        setAvatar(imageUrl: string | null) {
            update({ imageUrl });
        },
        /** Call after the name was saved. */
        setName(name: string | null) {
            update({ name });
        },

        /**
         * A user is signed in. Returns true when the caller should fetch their profile.
         * Values set before any consumer initialised (userId still null) belong to this user and
         * are kept; a different previous user's values are dropped.
         */
        signIn(userId: string): boolean {
            if (state.userId === userId) return false;
            const early = state.userId === null ? state : INITIAL_PROFILE;
            update({ userId, name: early.name, imageUrl: early.imageUrl });
            return needsLoad(state);
        },
        signOut() {
            if (state.userId) update({ ...INITIAL_PROFILE });
        },

        /** Apply a fetched profile; ignored for a stale user, never overwrites a value already set. */
        applyLoaded(forUserId: string, me: LoadedProfile) {
            if (state.userId !== forUserId) return;
            update({
                name: state.name === undefined ? (me.name || null) : state.name,
                imageUrl: state.imageUrl === undefined ? (me.imageUrl || null) : state.imageUrl,
            });
        },
        /**
         * A load failed: after a delay, forget the user (keeping any values) so the next render of
         * any consumer calls signIn again and retries, instead of staying "not loaded" all session.
         */
        loadFailed(forUserId: string) {
            schedule(() => {
                if (state.userId === forUserId && needsLoad(state)) update({ userId: null });
            }, retryMs);
        },
    };
}
