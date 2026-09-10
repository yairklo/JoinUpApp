import { useState, useEffect, DependencyList } from 'react';

/**
 * Shared hook to freeze Marker rasterization tracking after mount/prop updates.
 *
 * Keeps tracksViewChanges=true initially and upon visual/identity changes so
 * vector icon fonts and styling finish rendering to the native bitmap,
 * then sets tracksViewChanges=false after `ms` (default 500ms) for smooth 60fps panning.
 */
export function useTracksViewChangesFreeze(deps: DependencyList, ms = 500): boolean {
    const [tracks, setTracks] = useState(true);

    useEffect(() => {
        setTracks(true);
        const t = setTimeout(() => setTracks(false), ms);
        return () => clearTimeout(t);
    }, deps);

    return tracks;
}
