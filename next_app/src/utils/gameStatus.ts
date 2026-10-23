const HOUR_MS = 60 * 60 * 1000;

export type GameStatusInput = {
    status?: string | null;
    start?: string | null;
    /** Hours; defaults to 1 like the server. */
    duration?: number | null;
};

/**
 * A game is finished when it was marked COMPLETED or has run its full length.
 * Mirrors `isEligible` in server/services/gameResultService.js; CANCELLED games are never
 * "finished" (they keep their own cancelled handling).
 */
export function isGameFinished(game: GameStatusInput, now: number = Date.now()): boolean {
    if (game.status === "CANCELLED") return false;
    if (game.status === "COMPLETED") return true;
    if (!game.start) return false;
    const startMs = Date.parse(game.start);
    if (Number.isNaN(startMs)) return false;
    return startMs + (Number(game.duration) || 1) * HOUR_MS <= now;
}

/** What the game page shows; finished games are read-only history (no seats, no join CTAs). */
export function getGameVisibility(game: GameStatusInput, now: number = Date.now()) {
    const finished = isGameFinished(game, now);
    const cancelled = game.status === "CANCELLED";
    return {
        finished,
        showSeatCounter: !finished,
        showEmptySlots: !finished,
        showInvite: !finished,
        showJoinCtas: !finished && !cancelled,
        showCountdown: !finished,
    };
}
