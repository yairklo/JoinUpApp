/** A game card may offer "בטל השתתפות" only for someone else's game that has not started. */
export function canLeaveGame(
    game: {
        organizerId?: string | null;
        status?: string | null;
        start?: string | null;
        date?: string | null;
        time?: string | null;
    },
    userId: string | null | undefined,
): boolean {
    if (userId && game.organizerId && game.organizerId === userId) return false;
    if (game.status === "COMPLETED" || game.status === "CANCELLED") return false;
    const start = gameStartMs(game);
    if (start !== null && start < Date.now()) return false;
    return true;
}

function gameStartMs(game: { start?: string | null; date?: string | null; time?: string | null }): number | null {
    if (game.start) {
        const t = Date.parse(game.start);
        if (!Number.isNaN(t)) return t;
    }
    if (game.date && game.time && /^\d{4}-\d{2}-\d{2}$/.test(game.date)) {
        const t = Date.parse(`${game.date}T${game.time}`);
        if (!Number.isNaN(t)) return t;
    }
    return null;
}
