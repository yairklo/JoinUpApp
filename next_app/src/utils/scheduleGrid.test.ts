import { courtKey, courtLabelForMove, dedupeCourts, normalizeCourt, buildGrid, cellOccupants, cellToIso, gridStep, itemDays, unscheduled, type GridItem } from "./scheduleGrid";
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
        expect(gridStep(30, 40)).toBe(10);
        expect(g.step).toBe(10);
        expect(g.courts).toEqual(["מגרש 1", "מגרש 2"]);
        expect(g.startMin).toBe(18 * 60);
        const c = g.cells.find((x) => x.item.key === "c");
        expect(c).toMatchObject({ col: 0, row: 6, span: 4 });
        expect(g.cells).toHaveLength(3);
        // last start 60 minutes later, span of 4 ten-minute rows, plus one spare slot
        expect(g.slots).toBe(11);
    });

    it("does not stack 40-minute matches on a 30-minute grid", () => {
        const backToBack = [
            item("a", 1, "2026-11-12", "18:00", "מגרש 1"),
            item("b", 2, "2026-11-12", "18:40", "מגרש 1"),
            item("c", 3, "2026-11-12", "19:20", "מגרש 1"),
        ];
        const g = buildGrid(backToBack, "2026-11-12", { step: 30, durationMinutes: 40 });
        const spans = g.cells.map((c) => [c.row, c.row + c.span] as const);
        expect(spans).toEqual([[0, 4], [4, 8], [8, 12]]);
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
    it("places matches with bare-number court labels under the matching named court column", () => {
        const items = [item("a", 1, "2026-10-25", "10:00", "1"), item("b", 2, "2026-10-25", "10:00", "2")];
        const g = buildGrid(items, "2026-10-25", { step: 30, durationMinutes: 30, extraCourts: ["מגרש 1", "מגרש 2"] });
        expect(g.courts).toEqual(["מגרש 1", "מגרש 2"]);
        expect(g.cells.map((c) => c.col)).toEqual([0, 1]);
    });
    it("keeps the stored court label when a match is dropped on its own normalized column", () => {
        expect(courtLabelForMove("1", "מגרש 1")).toBe("1");
        expect(courtLabelForMove("1", "מגרש 2")).toBe("מגרש 2");
        expect(courtLabelForMove(null, "מגרש 1")).toBe("מגרש 1");
        expect(courtLabelForMove("Center", "center")).toBe("Center");
    });
    it("dedupes court names that differ only by the bare-number form", () => {
        expect(dedupeCourts(["מגרש 1", "מגרש 2", "1", "3", "A"])).toEqual(["מגרש 1", "מגרש 2", "מגרש 3", "A"]);
        expect(normalizeCourt(" 4 ")).toBe("מגרש 4");
    });
});

// Same table is asserted against the server's shared courtKey in server/tests/scheduleCourtKey.test.js.
const COURT_KEY_TABLE: Array<[unknown, string]> = [
    ["1", "1"],
    [1, "1"],
    ["01", "1"],
    ["מגרש 1", "1"],
    ["מגרש 01", "1"],
    [" מגרש  2 ", "2"],
    ["Center", "center"],
    [" center ", "center"],
    ["", ""],
    [null, ""],
    [undefined, ""],
];

describe("courtKey (web mirrors the server key)", () => {
    it.each(COURT_KEY_TABLE)("courtKey(%j) = %j", (input, expected) => {
        expect(courtKey(input)).toBe(expected);
    });
    it("agrees with the shared scheduler courtKey on the same inputs", () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const shared = require("../../../shared/tournament/scheduler") as { courtKey: (v: unknown) => string };
        for (const [input] of COURT_KEY_TABLE) expect(courtKey(input)).toBe(shared.courtKey(input));
    });
    it("dedupes and groups by case and padding", () => {
        expect(dedupeCourts(["Center", "center", "מגרש 01", "1", "מגרש 1"])).toEqual(["Center", "מגרש 1"]);
        const g = buildGrid(
            [item("a", 1, "2026-10-25", "10:00", "center"), item("b", 2, "2026-10-25", "10:00", "מגרש 01")],
            "2026-10-25",
            { step: 30, durationMinutes: 30, extraCourts: ["Center", "מגרש 1"] }
        );
        expect(g.courts).toHaveLength(2);
        expect(g.cells.map((c) => g.courts[c.col])).toEqual(["Center", "מגרש 1"]);
    });
});
