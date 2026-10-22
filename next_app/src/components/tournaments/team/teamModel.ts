import type { TeamMember, TeamStatus, TournamentTeam } from "@/types/tournament";

/** Team swatches (spec 4.1). Proposed to live in shared/teamColors.js (spec section 19). */
export const TEAM_COLORS = ["#E53935", "#FB8C00", "#FDD835", "#43A047", "#00ACC1", "#1E88E5", "#8E24AA", "#6D4C41"] as const;

export const NAME_MAX = 40;

export type TeamErrorView = { kind: "minors" } | { kind: "message"; text: string };

export interface TeamErrorContext {
    /** Max roster size, for TOO_MANY_PLAYERS. */
    max?: number;
    /** The error is about the current user (join / create) rather than an invited player. */
    self?: boolean;
}

/** Plain-language copy for known codes (spec 4.7). `null` = unknown code, let the caller use its generic fallback. */
export function teamErrorView(code: string | null | undefined, ctx: TeamErrorContext = {}): TeamErrorView | null {
    switch (code) {
        case "MINORS_NOT_ALLOWED":
            return { kind: "minors" };
        case "PLAYER_IN_OTHER_TEAM":
            return { kind: "message", text: ctx.self ? "כבר יש לך קבוצה בטורניר הזה" : "השחקן כבר בקבוצה אחרת בטורניר הזה" };
        case "TOO_MANY_PLAYERS":
            return { kind: "message", text: ctx.max ? `הסגל מלא (${ctx.max} שחקנים)` : "הסגל מלא" };
        case "ROSTER_LOCKED":
            return { kind: "message", text: "הסגל נעול. לשינויים פנו למארגן." };
        case "REGISTRATION_CLOSED":
            return { kind: "message", text: "ההרשמה לטורניר נסגרה" };
        case "NAME_TAKEN":
            return { kind: "message", text: "כבר יש קבוצה בשם הזה, נסו שם אחר" };
        case "INVALID_CODE":
            return { kind: "message", text: "הקישור לא תקין או שהוחלף. בקשו קישור חדש מהקפטן." };
        case "CAPTAIN_CANNOT_LEAVE":
            return { kind: "message", text: "קפטן לא יכול לעזוב. אפשר להוציא את הקבוצה מהטורניר." };
        default:
            return null;
    }
}

export interface RosterCounts {
    accepted: number;
    invited: number;
}

export function rosterCounts(members: Pick<TeamMember, "status">[]): RosterCounts {
    let accepted = 0;
    let invited = 0;
    for (const m of members) {
        if (m.status === "ACCEPTED") accepted++;
        else if (m.status === "INVITED") invited++;
    }
    return { accepted, invited };
}

/** Rows to render: accepted first (captain on top), then invited. Declined are returned separately; removed are dropped. */
export function partitionMembers(members: TeamMember[]) {
    const rank = (m: TeamMember) => (m.role === "CAPTAIN" ? 0 : m.role === "PLAYER" ? 1 : 2);
    const accepted = members.filter((m) => m.status === "ACCEPTED").sort((a, b) => rank(a) - rank(b));
    return {
        accepted,
        invited: members.filter((m) => m.status === "INVITED"),
        declined: members.filter((m) => m.status === "DECLINED"),
    };
}

export interface TeamBanner {
    key: string;
    severity: "info" | "success" | "warning" | "error";
    text: string;
}

export interface BannerInput {
    status: TeamStatus;
    accepted: number;
    min: number;
    /** ISO lock time; banner shows when already passed. */
    rosterLockAt?: string | null;
    now?: number;
}

/** Status banners in display order (spec 4.5). The first is the status banner; the rest are roster banners. */
export function teamBanners({ status, accepted, min, rosterLockAt, now = Date.now() }: BannerInput): TeamBanner[] {
    const out: TeamBanner[] = [];
    switch (status) {
        case "PENDING":
            out.push({ key: "pending", severity: "info", text: "ממתינה לאישור המארגן. בינתיים אפשר להזמין שחקנים." });
            break;
        case "APPROVED":
            out.push({ key: "approved", severity: "success", text: "הקבוצה אושרה! נתראה במגרש." });
            break;
        case "WAITLISTED":
            out.push({ key: "waitlisted", severity: "warning", text: "הטורניר מלא. הקבוצה ברשימת ההמתנה." });
            break;
        case "REJECTED":
            out.push({ key: "rejected", severity: "error", text: "הקבוצה לא אושרה לטורניר הזה." });
            break;
        case "WITHDRAWN":
            out.push({ key: "withdrawn", severity: "info", text: "הקבוצה יצאה מהטורניר." });
            break;
    }
    const active = status !== "WITHDRAWN" && status !== "REJECTED";
    if (active && accepted < min) {
        out.push({
            key: "invalid",
            severity: "warning",
            text: `חסרים ${min - accepted} שחקנים. קבוצה עם פחות מ-${min} שחקנים לא תאושר.`,
        });
    }
    if (active && isRosterLocked(rosterLockAt, now)) {
        out.push({
            key: "locked",
            severity: "info",
            text: `הסגל נעול מ-${new Date(rosterLockAt as string).toLocaleDateString("he-IL")}. לשינויים פנו למארגן.`,
        });
    }
    return out;
}

export function isRosterLocked(rosterLockAt: string | null | undefined, now = Date.now()): boolean {
    if (!rosterLockAt) return false;
    const t = new Date(rosterLockAt).getTime();
    return !Number.isNaN(t) && t <= now;
}

/** Result copy after creating a team (spec 4.1). */
export function createResultMessage(team: Pick<TournamentTeam, "status">, waitlisted: boolean): string {
    if (waitlisted || team.status === "WAITLISTED") return "הטורניר מלא. הקבוצה ברשימת ההמתנה";
    if (team.status === "APPROVED") return "הקבוצה נרשמה!";
    return "הקבוצה נרשמה וממתינה לאישור המארגן";
}

export function joinPath(tournamentId: string, code: string): string {
    return `/tournaments/${encodeURIComponent(tournamentId)}/join/${encodeURIComponent(code)}`;
}

/** Sanitise manual code entry: uppercase, alphanumerics only, 6 chars. */
export function normalizeJoinCode(raw: string): string {
    return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

export const ROLE_LABEL: Record<TeamMember["role"], string> = { CAPTAIN: "קפטן", PLAYER: "בסגל", SUBSTITUTE: "ספסל" };
