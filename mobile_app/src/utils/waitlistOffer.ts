import type { Game } from '@/types/game';

/**
 * Viewer has a reserved seat (or any PENDING row that should expose accept/decline).
 * Waitlist offers and approval-PENDING share status=PENDING; the confirm API distinguishes them.
 * Prefer showing offer CTAs whenever status is PENDING so mobile never dead-ends on
 * "ממתין לאישור" while web already shows accept/decline for the same offer.
 */
export function hasWaitlistOffer(
    game: Pick<Game, 'waitlistOfferPending' | 'viewerParticipationStatus' | 'joinPolicy'> | null | undefined
): boolean {
    if (!game) return false;
    if (game.waitlistOfferPending === true) return true;
    if (game.viewerParticipationStatus === 'PENDING') return true;
    return false;
}

/** True only for organizer-approval wait (not a waitlist spot offer). */
export function isOrganizerApprovalPending(
    game: Pick<Game, 'waitlistOfferPending' | 'viewerParticipationStatus' | 'joinPolicy'> | null | undefined
): boolean {
    if (!game) return false;
    return (
        game.viewerParticipationStatus === 'PENDING' &&
        game.joinPolicy === 'REQUIRES_APPROVAL' &&
        game.waitlistOfferPending !== true
    );
}
