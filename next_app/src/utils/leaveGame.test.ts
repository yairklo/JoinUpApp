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
});
