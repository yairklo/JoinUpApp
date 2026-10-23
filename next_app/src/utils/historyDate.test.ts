import { formatHistoryDateTime } from "./historyDate";

describe("formatHistoryDateTime", () => {
    test("matches the /profile format", () => {
        expect(formatHistoryDateTime("2026-10-19", "19:00")).toBe("19.10.2026 • 19:00");
    });
    test("missing parts degrade gracefully", () => {
        expect(formatHistoryDateTime("2026-10-19", null)).toBe("19.10.2026");
        expect(formatHistoryDateTime(null, "19:00")).toBe("19:00");
        expect(formatHistoryDateTime(undefined, undefined)).toBe("");
    });
});
