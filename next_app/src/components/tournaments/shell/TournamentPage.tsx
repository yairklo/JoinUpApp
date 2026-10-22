"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Skeleton from "@mui/material/Skeleton";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import ScoreEntrySheet from "../ScoreEntrySheet";
import UpdatedCue from "../UpdatedCue";
import BracketTab from "../tabs/BracketTab";
import ScheduleTab from "../tabs/ScheduleTab";
import StandingsTab from "../tabs/StandingsTab";
import TopPlayersTab from "../tabs/TopPlayersTab";
import OverviewTab from "./OverviewTab";
import TeamsTab from "./TeamsTab";
import TournamentHero from "./TournamentHero";
import { useBracket, useStandings, useTournament, useTournamentSchedule } from "@/hooks/tournaments";
import type { TournamentMatch } from "@/types/tournament";
import { TAB_LABEL, deriveChampion, heroCta, parseTab, visibleTabs, type TournamentTabKey } from "./shellModel";

function PageSkeleton() {
    return (
        <Container maxWidth="lg" sx={{ py: 3 }} dir="rtl" data-testid="tournament-loading" aria-busy="true" aria-label="טוען">
            <Skeleton variant="rounded" height={260} sx={{ mb: 2 }} />
            <Skeleton variant="rounded" height={48} sx={{ mb: 2 }} />
            <Skeleton variant="rounded" height={200} />
        </Container>
    );
}

/** `/tournaments/[id]`: hero + tabs shell (spec 2). The active tab lives in `?tab=`. */
export default function TournamentPage({ id }: { id: string }) {
    const router = useRouter();
    const pathname = usePathname();
    const search = useSearchParams();
    const { isSignedIn } = useAuth();
    const { tournament, loading, error, notFound, updated, reload } = useTournament(id);
    const bracket = useBracket(id, { live: false });
    const standings = useStandings(id, { live: false });
    const { matches } = useTournamentSchedule(id, {}, { live: false });
    const [scoreMatch, setScoreMatch] = useState<TournamentMatch | null>(null);

    const hasKnockout = bracket.stages.some((s) => s.rounds.some((r) => r.matches.length > 0));
    const tabs = useMemo(() => (tournament ? visibleTabs(tournament, { hasKnockout }) : []), [tournament, hasKnockout]);
    const active = parseTab(search?.get("tab"), tabs);
    const liveCount = matches.filter((m) => m.status === "LIVE").length;

    const setTab = useCallback(
        (tab: TournamentTabKey) => {
            const p = new URLSearchParams(search?.toString() ?? "");
            if (tab === "overview") p.delete("tab");
            else p.set("tab", tab);
            const qs = p.toString();
            const base = pathname ?? "";
            router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
        },
        [router, pathname, search]
    );

    // A shared link to a tab that is not visible (yet) falls back to the overview.
    useEffect(() => {
        if (tournament && search?.get("tab") && active === "overview" && search.get("tab") !== "overview") setTab("overview");
    }, [tournament, active, search, setTab]);

    const champion = useMemo(
        () => (tournament ? deriveChampion(tournament, bracket.stages, standings.tables) : { champion: null, second: null, third: null }),
        [tournament, bracket.stages, standings.tables]
    );

    if (loading && !tournament) return <PageSkeleton />;
    if (notFound || (!tournament && !error)) {
        return (
            <Container maxWidth="sm" sx={{ py: 6 }} dir="rtl" data-testid="tournament-not-found">
                <Alert severity="info" action={<Button component={Link} href="/tournaments" color="inherit" size="small">לטורנירים</Button>}>
                    הטורניר לא נמצא.
                </Alert>
            </Container>
        );
    }
    if (error || !tournament) {
        return (
            <Container maxWidth="sm" sx={{ py: 6 }} dir="rtl" data-testid="tournament-error">
                <Alert
                    severity={typeof navigator !== "undefined" && navigator.onLine === false ? "warning" : "error"}
                    action={<Button color="inherit" size="small" onClick={() => void reload()}>נסו שוב</Button>}
                >
                    לא הצלחנו לטעון את הטורניר.
                </Alert>
            </Container>
        );
    }

    const t = tournament;
    const canScore = t.capabilities.canScore;
    const cta = heroCta(t, !!isSignedIn);
    const onScoreMatch = canScore ? setScoreMatch : undefined;

    return (
        <Container maxWidth="lg" sx={{ py: { xs: 2, md: 3 }, pb: { xs: 12, md: 4 } }} dir="rtl" data-testid="tournament-page">
            <TournamentHero
                tournament={t}
                cta={cta}
                champion={champion}
                liveCount={liveCount}
                onScoreCta={() => setTab("schedule")}
                onGoLive={() => setTab("schedule")}
            />
            <Box sx={{ position: "sticky", top: { xs: 56, md: 64 }, zIndex: 10, bgcolor: "background.default", mt: 2, borderBottom: 1, borderColor: "divider" }}>
                <Tabs value={active} onChange={(_, v: TournamentTabKey) => setTab(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile aria-label="אזורי הטורניר">
                    {tabs.map((k) => (
                        <Tab key={k} value={k} label={TAB_LABEL[k]} data-testid={`tournament-tab-${k}`} sx={{ minHeight: 48, fontWeight: 700 }} />
                    ))}
                </Tabs>
            </Box>
            <Box sx={{ mt: 1 }}>
                <UpdatedCue show={updated} testId="tournament-updated-cue" />
            </Box>
            <Box sx={{ mt: 1 }} role="tabpanel">
                {active === "overview" && <OverviewTab tournament={t} onGoTab={setTab} onScoreMatch={onScoreMatch} />}
                {active === "teams" && (
                    <TeamsTab tournament={t} registerHref={t.capabilities.canRegisterTeam ? `/tournaments/${t.id}/team/new` : undefined} />
                )}
                {active === "schedule" && <ScheduleTab tournamentId={t.id} canScore={canScore} onScoreMatch={onScoreMatch} />}
                {active === "standings" && <StandingsTab tournamentId={t.id} />}
                {active === "bracket" && <BracketTab tournamentId={t.id} />}
                {active === "leaders" && <TopPlayersTab tournamentId={t.id} />}
            </Box>
            {canScore && (
                <ScoreEntrySheet
                    open={!!scoreMatch}
                    tournament={t}
                    match={scoreMatch}
                    onClose={() => setScoreMatch(null)}
                    onSaved={() => void reload()}
                />
            )}
        </Container>
    );
}
