import { renderToStaticMarkup } from "react-dom/server";
import MatchCard from "./MatchCard";
import StandingsTable from "./StandingsTable";
import BracketView from "./BracketView";
import type { BracketStage, MatchSlot, StandingsTableData, TournamentMatch } from "@/types/tournament";

const team = (id: string, name = id) => ({ id, name, color: "#16a34a", logoUrl: null });
const slot = (id: string | null, name?: string, source: MatchSlot["source"] = null): MatchSlot => ({
    teamId: id,
    team: id ? team(id, name) : null,
    source,
});
const match = (over: Partial<TournamentMatch> = {}): TournamentMatch => ({
    id: "m1", number: 1, stageId: "s", groupId: null, round: 1, status: "SCHEDULED",
    home: slot("a", "הכחולים"), away: slot("b", "האדומים"), scheduledAt: "2026-11-12T15:30:00Z",
    fieldId: null, courtLabel: "מגרש 2", homeScore: null, awayScore: null, homePenalties: null,
    awayPenalties: null, details: null, winnerTeamId: null, version: 1, ...over,
});

describe("MatchCard", () => {
    test("scheduled shows time, not a score, and hides the score button without canScore", () => {
        const html = renderToStaticMarkup(<MatchCard match={match()} />);
        expect(html).toContain("17:30");
        expect(html).not.toContain("match-card-edit-m1");
    });
    test("score button appears with canScore", () => {
        const html = renderToStaticMarkup(<MatchCard match={match()} canScore onScore={() => {}} />);
        expect(html).toContain("match-card-edit-m1");
    });
    test("finished with penalties and forfeit caption", () => {
        const pens = renderToStaticMarkup(
            <MatchCard match={match({ status: "FINISHED", homeScore: 2, awayScore: 2, homePenalties: 4, awayPenalties: 3, winnerTeamId: "a" })} />
        );
        expect(pens).toContain("פנדלים 4 : 3");
        const ff = renderToStaticMarkup(
            <MatchCard match={match({ status: "FORFEIT", homeScore: 3, awayScore: 0, winnerTeamId: "a" })} />
        );
        expect(ff).toContain("(הפסד טכני)");
        expect(ff).toContain("ניצחון טכני");
    });
    test("tennis renders set scores", () => {
        const html = renderToStaticMarkup(
            <MatchCard match={match({ status: "FINISHED", homeScore: 2, awayScore: 1, winnerTeamId: "a", details: { sets: [[6, 4], [3, 6], [10, 7]] } })} />
        );
        expect(html).toContain("match-card-m1-score-sets");
    });
    test("unknown teams render placeholders", () => {
        const html = renderToStaticMarkup(<MatchCard match={match({ home: slot(null), away: slot(null) })} />);
        expect(html).toContain("ייקבע בהמשך");
    });
});

describe("StandingsTable", () => {
    const row = (id: string, rank: number, over = {}) => ({
        rank, team: team(id, id), played: 3, won: 2, drawn: 0, lost: 1, gf: 6, ga: 4, gd: -2, points: 6, tied: false, manualRank: null, ...over,
    });
    const table: StandingsTableData = {
        stageId: "s", stageName: "ליגה", stageType: "GROUP", groupId: "g", groupName: "א׳", complete: false, needsManualRank: true,
        rows: [row("a", 1), row("b", 2, { tied: true }), row("c", 3, { manualRank: 3 })],
    };
    test("compact has 5 data columns and a signed gd with real minus", () => {
        const html = renderToStaticMarkup(<StandingsTable table={table} mode="compact" advanceCount={2} />);
        expect(html).toContain("−2");
        expect(html).not.toContain(">נ׳<");
        expect(html).toContain("=2");
        expect(html).toContain("עולות לשלב הבא");
        expect(html).toContain("standings-needs-manual-rank");
    });
    test("full has all columns and the manual-rank button for managers", () => {
        const html = renderToStaticMarkup(<StandingsTable table={table} mode="full" canManage onSetManualRank={() => {}} />);
        expect(html).toContain(">נ׳<");
        expect(html).toContain("קביעת סדר");
    });
});

describe("BracketView", () => {
    const stage = (n: number): BracketStage => {
        const rounds = [];
        let count = n / 2;
        let r = 1;
        while (count >= 1) {
            rounds.push({
                round: r,
                name: count === 1 ? "FINAL" : count === 2 ? "SEMI_FINAL" : "QUARTER_FINAL",
                matches: Array.from({ length: count }, (_, i) =>
                    match({ id: `r${r}m${i}`, number: r * 100 + i, round: r, home: slot(r === 1 ? `t${i * 2}` : null), away: slot(r === 1 ? `t${i * 2 + 1}` : null) })
                ),
            });
            count /= 2;
            r++;
        }
        return { stageId: "s", name: "נוקאאוט", rounds };
    };
    test("2 teams: a single final cell", () => {
        const html = renderToStaticMarkup(<BracketView stage={stage(2)} mode="tree" />);
        expect(html).toContain("bracket-cell-r1m0");
        expect(html).not.toContain("bracket-round-2");
    });
    test("32 teams in tree mode render every round and zoom controls", () => {
        const html = renderToStaticMarkup(<BracketView stage={stage(32)} mode="tree" />);
        expect(html).toContain("bracket-round-5");
        expect(html).toContain("bracket-zoom-fit");
        expect((html.match(/data-testid="bracket-cell-r1m\d+"/g) ?? []).length).toBe(16);
    });
    test("rounds mode renders pills and round columns", () => {
        const html = renderToStaticMarkup(<BracketView stage={stage(8)} mode="rounds" highlightTeamId="t0" />);
        expect(html).toContain("bracket-round-pill-1");
        expect(html).toContain("bracket-my-path");
    });
});
