import { useCallback, useState } from 'react';
import { fieldsApi, Field } from '@/services/api';
import { MapBounds } from '@/components/map/types';
import { isAbortError } from '@/utils/apiErrors';

// Caps how many courts the map keeps accumulating as the user explores, so the
// per-sport Supercluster rebuild (server/routes/fields.js's /map results feed it)
// stays cheap regardless of how much of the map has been panned over this session.
const MAX_CACHED_MAP_FIELDS = 400;

/** Expands a bounding box by a multiplier so surrounding courts are preloaded. */
export function expandBounds(bounds: MapBounds, factor = 2.0): MapBounds {
    const latSpan = Math.max(bounds.maxLat - bounds.minLat, 0.04);
    const lngSpan = Math.max(bounds.maxLng - bounds.minLng, 0.04);
    const latPad = (latSpan * (factor - 1)) / 2;
    const lngPad = (lngSpan * (factor - 1)) / 2;
    return {
        minLat: Math.max(-90, Number((bounds.minLat - latPad).toFixed(6))),
        maxLat: Math.min(90, Number((bounds.maxLat + latPad).toFixed(6))),
        minLng: Math.max(-180, Number((bounds.minLng - lngPad).toFixed(6))),
        maxLng: Math.min(180, Number((bounds.maxLng + lngPad).toFixed(6))),
    };
}

function mergeCapped(prev: Field[], incoming: Field[], cap?: { centerLat: number; centerLng: number }) {
    const prevMap = new Map(prev.map((f) => [f.id, f] as const));
    const changed = incoming.some((f) => {
        const existing = prevMap.get(f.id);
        return !existing || existing.lat !== f.lat || existing.lng !== f.lng;
    });
    if (!changed && (!cap || prev.length <= MAX_CACHED_MAP_FIELDS)) return prev;

    for (const f of incoming) prevMap.set(f.id, f);
    let merged = Array.from(prevMap.values());

    if (merged.length > MAX_CACHED_MAP_FIELDS) {
        merged = cap
            // Bounds-driven fetch: drop whatever is farthest from this fetch's own center.
            ? merged
                .map((f) => ({ field: f, distance: Math.hypot(f.lat! - cap.centerLat, f.lng! - cap.centerLng) }))
                .sort((a, b) => a.distance - b.distance)
                .slice(0, MAX_CACHED_MAP_FIELDS)
                .map((x) => x.field)
            // mergeFields has no viewport center to measure distance from -- fall back to
            // dropping the oldest entries (Map preserves insertion order) so the cap is
            // still enforced regardless of which path added fields.
            : merged.slice(merged.length - MAX_CACHED_MAP_FIELDS);
    }
    return merged;
}

interface UseMapFieldsOptions {
    query?: string;
    sport?: string;
    city?: string;
    /** Skip fetching entirely (e.g. an "empty fields" toggle that's currently off). */
    enabled?: boolean;
}

/**
 * Fetches courts for the map's current viewport via the slim /api/fields/map endpoint,
 * accumulating them across pans/zooms (so already-viewed courts don't vanish) while
 * capping the cache and skipping the state update entirely when a fetch didn't actually
 * change anything -- keeps AppBaseMap's per-sport Supercluster rebuild cheap regardless
 * of how much of the map has been explored. Kept as its own hook (rather than inlined in
 * the fields directory screen) so any future map-driven screen can reuse the same fetch/
 * cache behavior instead of re-deriving it.
 */
export function useMapFields({ query, sport, city, enabled = true }: UseMapFieldsOptions = {}) {
    const [fields, setFields] = useState<Field[]>([]);
    const [loading, setLoading] = useState(false);

    // For merging in fields discovered another way (e.g. a text search match outside the
    // current viewport) without waiting on a bounds-based fetch.
    const mergeFields = useCallback((incoming: Field[]) => {
        if (incoming.length === 0) return;
        setFields((prev) => mergeCapped(prev, incoming));
    }, []);

    const fetchForBounds = useCallback(async (bounds: MapBounds) => {
        if (!enabled) return;
        const expanded = expandBounds(bounds, 2.0);
        setLoading(true);
        try {
            const results = await fieldsApi.searchMap(expanded, { q: query, sport, city });
            const valid = results.filter((f) => f.lat != null && f.lng != null);
            const centerLat = (bounds.minLat + bounds.maxLat) / 2;
            const centerLng = (bounds.minLng + bounds.maxLng) / 2;
            setFields((prev) => mergeCapped(prev, valid, { centerLat, centerLng }));
        } catch (error: any) {
            if (isAbortError(error)) return;
            console.error('Failed to load map fields', error);
        } finally {
            setLoading(false);
        }
    }, [query, sport, city, enabled]);

    return { fields, loading, fetchForBounds, mergeFields };
}
