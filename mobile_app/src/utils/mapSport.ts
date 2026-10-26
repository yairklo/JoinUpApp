/**
 * Shared sport icon + color helpers for map markers (search + game creation).
 * Implementation lives in @joinup/shared/mapSport so web and mobile stay identical.
 */
export {
    NEUTRAL_MARKER_VISUAL,
    EMPTY_FIELD_MARKER_VISUAL,
    getFieldSportTags,
    fieldMatchesSportFilter,
    getSportIconName,
    getSportColorHex,
    getSportMarkerVisual,
    getFieldMarkerVisual,
} from '@joinup/shared/mapSport';
export type { MarkerVisual, MarkerVisualVariant } from '@joinup/shared/mapSport';
