import { parseTab, tabHref } from "./shellModel";

describe("tabHref", () => {
    test("sets ?tab= and keeps other params", () => {
        expect(tabHref("/tournaments/t1", "", "standings")).toBe("/tournaments/t1?tab=standings");
        expect(tabHref("/tournaments/t1", "x=1&tab=teams", "bracket")).toBe("/tournaments/t1?x=1&tab=bracket");
    });
    test("overview drops the param", () => {
        expect(tabHref("/tournaments/t1", "tab=teams", "overview")).toBe("/tournaments/t1");
        expect(tabHref("/tournaments/t1", "x=1&tab=teams", "overview")).toBe("/tournaments/t1?x=1");
    });
});

describe("parseTab", () => {
    test("an unknown or hidden tab falls back to overview", () => {
        expect(parseTab("bracket", ["overview", "teams"])).toBe("overview");
        expect(parseTab("teams", ["overview", "teams"])).toBe("teams");
        expect(parseTab(null, ["overview", "teams"])).toBe("overview");
    });
});
