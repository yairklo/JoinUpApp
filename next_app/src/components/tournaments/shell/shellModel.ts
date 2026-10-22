import type {
    BracketStage,
    StandingsTableData,
    TeamLite,
    Tournament,
    TournamentDetail,
    TournamentFormat,
    TournamentStatus,
} from "@/types/tournament";

export const FORMAT_LABEL: Record<TournamentFormat, string> = {
    LEAGUE: "ליגה",
    KNOCKOUT: "נוקאאוט",
    GROUPS_KNOCKOUT: "בתים + נוקאאוט",
    CUSTOM: "מותאם אישית",
};

export type TournamentTabKey = "overview" | "teams" | "schedule" | "standings" | "bracket" | "leaders";

export const TAB_LABEL: Record<TournamentTabKey, string> = {
    overview: "סקירה",
    teams: "קבוצות",
    schedule: "לוח משחקים",
    standings: "טבלה",
    bracket: "עץ",
    leaders: "שחקנים בולטים",
};

export interface TabVisibility {
    hasKnockout: boolean;
}

/** Spec 2.3 visibility rules. */
export function visibleTabs(t: Pick<TournamentDetail, "format" | "counts">, v: TabVisibility): TournamentTabKey[] {
    const tabs: TournamentTabKey[] = ["overview", "teams", "schedule"];
    if (t.format === "LEAGUE" || t.format === "GROUPS_KNOCKOUT") tabs.push("standings");
    if (v.hasKnockout) tabs.push("bracket");
    if (t.counts.matchesFinished > 0) tabs.push("leaders");
    return tabs;
}

export function parseTab(raw: string | null | undefined, tabs: readonly TournamentTabKey[]): TournamentTabKey {
    return (tabs as readonly string[]).includes(raw ?? "") ? (raw as TournamentTabKey) : "overview";
}

export type HeroCta =
    | { kind: "manage"; label: string; href: string }
    | { kind: "score"; label: string }
    | { kind: "myTeam"; label: string; href: string }
    | { kind: "register"; label: string; href: string; secondary?: { label: string; href: string } }
    | { kind: "signin"; label: string }
    | null;

/** Role matrix (spec 0.8). Hidden rather than disabled: returns null when nothing applies. */
export function heroCta(t: TournamentDetail, signedIn: boolean): HeroCta {
    if (t.status === "CANCELLED") return null;
    if (t.capabilities.canManage) return { kind: "manage", label: "ניהול הטורניר", href: `/tournaments/${t.id}/manage` };
    if (t.capabilities.canScore && t.status === "IN_PROGRESS") return { kind: "score", label: "הזנת תוצאות" };
    const team = t.myTeam;
    if (team && team.memberStatus === "ACCEPTED" && team.status !== "WITHDRAWN" && team.status !== "REJECTED") {
        return {
            kind: "myTeam",
            label: team.isCaptain ? "ניהול הקבוצה" : "הקבוצה שלי",
            href: `/tournaments/${t.id}/team/${team.id}`,
        };
    }
    if (!signedIn) {
        return t.status === "REGISTRATION_OPEN" ? { kind: "signin", label: "התחברות להרשמה" } : null;
    }
    if (t.capabilities.canRegisterTeam) {
        return {
            kind: "register",
            label: "רישום קבוצה",
            href: `/tournaments/${t.id}/team/new`,
            secondary: { label: "הצטרפות עם קוד", href: `/tournaments/invites` },
        };
    }
    return null;
}

/** Champion: knockout final winner (non-third-place, last round), else league rank 1 when the table is complete. */
export function deriveChampion(
    t: Pick<TournamentDetail, "status" | "format">,
    bracket: readonly BracketStage[],
    tables: readonly StandingsTableData[]
): { champion: TeamLite | null; second: TeamLite | null; third: TeamLite | null } {
    const none = { champion: null, second: null, third: null };
    if (t.status !== "COMPLETED") return none;
    const stage = [...bracket].reverse().find((s) => s.rounds.some((r) => r.matches.length > 0));
    if (stage) {
        const rounds = [...stage.rounds].sort((a, b) => a.round - b.round);
        const last = rounds[rounds.length - 1];
        const final = last.matches.find((m) => !m.isThirdPlace) ?? last.matches[0];
        if (final?.winnerTeamId) {
            const home = final.home.team;
            const away = final.away.team;
            const champion = final.home.teamId === final.winnerTeamId ? home : away;
            const second = final.home.teamId === final.winnerTeamId ? away : home;
            const tp = rounds.flatMap((r) => r.matches).find((m) => m.isThirdPlace && m.winnerTeamId);
            const third = tp ? (tp.home.teamId === tp.winnerTeamId ? tp.home.team : tp.away.team) : null;
            return { champion, second, third };
        }
    }
    if (t.format === "LEAGUE") {
        const table = tables.find((x) => x.complete) ?? null;
        if (table) {
            const by = (r: number) => table.rows.find((x) => x.rank === r)?.team ?? null;
            return { champion: by(1), second: by(2), third: by(3) };
        }
    }
    return none;
}

export type ListSection = "open" | "live" | "done" | "draft";

export const SECTION_LABEL: Record<ListSection, string> = {
    draft: "הטיוטות שלי",
    open: "פתוחים להרשמה",
    live: "מתקיימים עכשיו",
    done: "הסתיימו",
};

export function sectionOf(status: TournamentStatus): ListSection {
    if (status === "DRAFT") return "draft";
    if (status === "REGISTRATION_OPEN" || status === "REGISTRATION_CLOSED") return "open";
    if (status === "IN_PROGRESS") return "live";
    return "done";
}

export function sectionize(list: readonly Tournament[]): Array<{ key: ListSection; items: Tournament[] }> {
    const order: ListSection[] = ["draft", "open", "live", "done"];
    return order
        .map((key) => ({ key, items: list.filter((t) => sectionOf(t.status) === key) }))
        .filter((s) => s.items.length > 0);
}

export type StatusFilterKey = "all" | "open" | "live" | "done";

export const STATUS_FILTERS: Array<{ key: StatusFilterKey; label: string; statuses?: TournamentStatus[] }> = [
    { key: "all", label: "הכל" },
    { key: "open", label: "פתוחים להרשמה", statuses: ["REGISTRATION_OPEN"] },
    { key: "live", label: "מתקיימים", statuses: ["IN_PROGRESS"] },
    { key: "done", label: "הסתיימו", statuses: ["COMPLETED"] },
];

export function dateRangeLabel(startsAt: string, endsAt?: string | null): string {
    const fmt = (iso: string) => {
        const d = new Date(iso);
        return `${d.getDate()}/${d.getMonth() + 1}`;
    };
    const a = fmt(startsAt);
    if (!endsAt) return a;
    const b = fmt(endsAt);
    return a === b ? a : `${a}–${b}`;
}

export function shortDate(iso?: string | null): string {
    if (!iso) return "";
    const d = new Date(iso);
    return `${d.getDate()}/${d.getMonth() + 1}`;
}

/** Registration closes in under 3 days (card caption turns success-coloured, spec 1.2). */
export function closesSoon(iso?: string | null, now = Date.now()): boolean {
    if (!iso) return false;
    const ms = new Date(iso).getTime() - now;
    return ms > 0 && ms < 3 * 24 * 3600 * 1000;
}
