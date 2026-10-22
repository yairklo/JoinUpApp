import { canLeaveGame } from "./leaveGame";

const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();

describe("canLeaveGame", () => {
    it("hides the button for the organizer and for a game that already started", () => {
        expect(canLeaveGame({ organizerId: "me", start: future, status: "OPEN" }, "me")).toBe(false);
        expect(canLeaveGame({ organizerId: "other", start: past, status: "OPEN" }, "me")).toBe(false);
        expect(canLeaveGame({ organizerId: "other", start: future, status: "COMPLETED" }, "me")).toBe(false);
        expect(canLeaveGame({ organizerId: "other", start: future, status: "OPEN" }, "me")).toBe(true);
    });

    it("reads the game page date, which is DD/MM/YYYY, when start is missing", () => {
        const pastAt = new Date(Date.now() - 60 * 60 * 1000);
        const futureAt = new Date(Date.now() + 60 * 60 * 1000);
        const stamp = (d: Date) => {
            const p = (n: number) => String(n).padStart(2, "0");
            return { date: `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` };
        };
        expect(canLeaveGame({ organizerId: "other", ...stamp(pastAt), status: "OPEN" }, "me")).toBe(false);
        expect(canLeaveGame({ organizerId: "other", ...stamp(futureAt), status: "OPEN" }, "me")).toBe(true);
    });
});
