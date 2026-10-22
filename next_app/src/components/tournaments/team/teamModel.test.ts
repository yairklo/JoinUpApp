import {
    createResultMessage,
    isRosterLocked,
    joinPath,
    normalizeJoinCode,
    partitionMembers,
    rosterCounts,
    teamBanners,
    teamErrorView,
} from "./teamModel";
import type { TeamMember } from "@/types/tournament";

const m = (userId: string, role: TeamMember["role"], status: string): TeamMember => ({ userId, name: userId, role, status });

describe("teamModel", () => {
    it("maps known error codes", () => {
        expect(teamErrorView("MINORS_NOT_ALLOWED")).toEqual({ kind: "minors" });
        expect(teamErrorView("PLAYER_IN_OTHER_TEAM", { self: true })).toEqual({ kind: "message", text: "כבר יש לך קבוצה בטורניר הזה" });
        expect(teamErrorView("TOO_MANY_PLAYERS", { max: 9 })).toEqual({ kind: "message", text: "הסגל מלא (9 שחקנים)" });
        for (const c of ["ROSTER_LOCKED", "REGISTRATION_CLOSED", "NAME_TAKEN", "INVALID_CODE", "CAPTAIN_CANNOT_LEAVE"]) {
            expect(teamErrorView(c)?.kind).toBe("message");
        }
        expect(teamErrorView("SOMETHING_ELSE")).toBeNull();
        expect(teamErrorView(null)).toBeNull();
    });

    it("counts and partitions members", () => {
        const ms = [m("a", "PLAYER", "ACCEPTED"), m("b", "CAPTAIN", "ACCEPTED"), m("c", "PLAYER", "INVITED"), m("d", "PLAYER", "DECLINED"), m("e", "PLAYER", "REMOVED")];
        expect(rosterCounts(ms)).toEqual({ accepted: 2, invited: 1 });
        const p = partitionMembers(ms);
        expect(p.accepted.map((x) => x.userId)).toEqual(["b", "a"]);
        expect(p.invited).toHaveLength(1);
        expect(p.declined).toHaveLength(1);
    });

    it("builds banners", () => {
        const b = teamBanners({ status: "PENDING", accepted: 3, min: 5 });
        expect(b.map((x) => x.key)).toEqual(["pending", "invalid"]);
        expect(b[1].text).toContain("חסרים 2 שחקנים");
        expect(teamBanners({ status: "WITHDRAWN", accepted: 0, min: 5 }).map((x) => x.key)).toEqual(["withdrawn"]);
        const locked = teamBanners({ status: "APPROVED", accepted: 5, min: 5, rosterLockAt: "2020-01-01T00:00:00Z" });
        expect(locked.map((x) => x.key)).toEqual(["approved", "locked"]);
    });

    it("roster lock, messages, code helpers", () => {
        expect(isRosterLocked(null)).toBe(false);
        expect(isRosterLocked("2999-01-01T00:00:00Z")).toBe(false);
        expect(createResultMessage({ status: "APPROVED" }, false)).toBe("הקבוצה נרשמה!");
        expect(createResultMessage({ status: "PENDING" }, true)).toContain("רשימת ההמתנה");
        expect(joinPath("t 1", "AB12")).toBe("/tournaments/t%201/join/AB12");
        expect(normalizeJoinCode(" ab-12cd9 ")).toBe("AB12CD");
    });
});
