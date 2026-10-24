import { getGameVisibility, isGameFinished } from "./gameStatus";

const NOW = Date.parse("2026-06-10T12:00:00Z");
const iso = (offsetHours: number) => new Date(NOW + offsetHours * 3600_000).toISOString();

describe("isGameFinished", () => {
    it("is finished when COMPLETED, even if start is in the future", () => {
        expect(isGameFinished({ status: "COMPLETED", start: iso(5) }, NOW)).toBe(true);
    });
    it("is finished once start + duration has passed (default 1h)", () => {
        expect(isGameFinished({ status: "OPEN", start: iso(-1.5) }, NOW)).toBe(true);
        expect(isGameFinished({ status: "OPEN", start: iso(-1) }, NOW)).toBe(true);
        expect(isGameFinished({ status: "OPEN", start: iso(-1.5), duration: 2 }, NOW)).toBe(false);
        expect(isGameFinished({ status: "OPEN", start: iso(-3), duration: 2 }, NOW)).toBe(true);
    });
    it("leaves upcoming and in-progress games alone", () => {
        expect(isGameFinished({ status: "OPEN", start: iso(3) }, NOW)).toBe(false);
        expect(isGameFinished({ status: "OPEN", start: iso(-0.5) }, NOW)).toBe(false);
        expect(isGameFinished({ status: "OPEN" }, NOW)).toBe(false);
    });
    it("never treats a cancelled game as finished", () => {
        expect(isGameFinished({ status: "CANCELLED", start: iso(-10) }, NOW)).toBe(false);
    });
});

describe("getGameVisibility", () => {
    it("hides seats, slots, invite, join CTAs and countdown for a finished game", () => {
        expect(getGameVisibility({ status: "COMPLETED", start: iso(-5) }, NOW)).toEqual({
            finished: true,
            showJoinCtas: false,
        });
    });
    it("keeps everything for an upcoming game", () => {
        expect(getGameVisibility({ status: "OPEN", start: iso(4) }, NOW)).toEqual({
            finished: false,
            showJoinCtas: true,
        });
    });
    it("cancelled game: not finished, no join CTAs, rest unchanged", () => {
        const v = getGameVisibility({ status: "CANCELLED", start: iso(-10) }, NOW);
        expect(v.finished).toBe(false);
        expect(v.showJoinCtas).toBe(false);
        expect(v.finished).toBe(false);
    });
});
