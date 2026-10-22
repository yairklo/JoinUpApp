import { buildGrid, cellOccupants, cellToIso, itemDays, unscheduled, type GridItem } from "./scheduleGrid";
import { israelToIso } from "./tournamentManage";

const at = (date: string, time: string) => israelToIso(date, time) as string;
const item = (key: string, n: number, date: string, time: string, court: string | null): GridItem => ({
    key,
    number: n,
    scheduledAt: at(date, time),
    court,
    home: "א",
    away: "ב",
});

describe("scheduleGrid", () => {
    const items = [
        item("a", 1, "2026-11-12", "18:00", "מגרש 1"),
        item("b", 2, "2026-11-12", "18:00", "מגרש 2"),
        item("c", 3, "2026-11-12", "19:00", "מגרש 1"),
        item("d", 4, "2026-11-13", "10:00", "מגרש 1"),
        { key: "e", number: 5, scheduledAt: null, court: null, home: "א", away: "ב" } as GridItem,
    ];

    it("lists distinct Israel days and unscheduled items", () => {
        expect(itemDays(items)).toEqual(["2026-11-12", "2026-11-13"]);
        expect(unscheduled(items).map((i) => i.key)).toEqual(["e"]);
    });

    it("places blocks by court column and slot row, spanning the match duration", () => {
        const g = buildGrid(items, "2026-11-12", { step: 30, durationMinutes: 40 });
        expect(g.courts).toEqual(["מגרש 1", "מגרש 2"]);
        expect(g.startMin).toBe(18 * 60);
        const c = g.cells.find((x) => x.item.key === "c");
        expect(c).toMatchObject({ col: 0, row: 2, span: 2 });
        expect(g.cells).toHaveLength(3);
        // last start at row 2 + span 2 + one spare slot
        expect(g.slots).toBe(5);
    });

    it("keeps empty extra courts as columns and handles empty days", () => {
        const g = buildGrid(items, "2026-11-12", { step: 30, durationMinutes: 30, extraCourts: ["מגרש 3"] });
        expect(g.courts).toEqual(["מגרש 1", "מגרש 2", "מגרש 3"]);
        const empty = buildGrid(items, "2026-12-01", { step: 30, durationMinutes: 30 });
        expect(empty.cells).toEqual([]);
    });

    it("maps a cell back to an ISO instant and detects occupants", () => {
        const g = buildGrid(items, "2026-11-12", { step: 30, durationMinutes: 60 });
        expect(cellToIso("2026-11-12", g, 2)).toBe(at("2026-11-12", "19:00"));
        expect(cellOccupants(g, 0, 1, 2).map((c) => c.item.key)).toEqual(["a", "c"]);
        expect(cellOccupants(g, 0, 1, 2, "a").map((c) => c.item.key)).toEqual(["c"]);
        expect(cellOccupants(g, 1, 4, 1)).toEqual([]);
    });
});
