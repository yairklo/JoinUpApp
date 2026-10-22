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
    const iso = isoDate(game.date);
    if (iso && game.time) {
        const t = Date.parse(`${iso}T${game.time}`);
        if (!Number.isNaN(t)) return t;
    }
    return null;
}

/** Game cards use YYYY-MM-DD; the game page formats the same instant as DD/MM/YYYY. */
function isoDate(date: string | null | undefined): string | null {
    if (!date) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date);
    return dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : null;
}
