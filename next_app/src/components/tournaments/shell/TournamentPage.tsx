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
import { alpha } from "@mui/material/styles";
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
import { TAB_LABEL, deriveChampion, heroCta, parseTab, tabHref, visibleTabs, type TournamentTabKey } from "./shellModel";

function PageSkeleton() {
    return (
        <Container maxWidth="lg" sx={{ py: 3 }} dir="rtl" data-testid="tournament-loading" aria-busy="true" aria-label="טוען">
            <Skeleton variant="rounded" height={260} sx={{ mb: 2, borderRadius: 3 }} />
            <Skeleton variant="rounded" height={48} sx={{ mb: 2, borderRadius: 2 }} />
            <Skeleton variant="rounded" height={200} sx={{ borderRadius: 2.5 }} />
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
    // The panel follows local state so a click renders at once; `?tab=` stays the shareable source of truth
    // (router.replace alone left the panel stale until a reload).
    const urlTab = search?.get("tab") ?? null;
    const [pickedTab, setPickedTab] = useState<string | null>(urlTab);
    useEffect(() => setPickedTab(urlTab), [urlTab]);
    const active = parseTab(pickedTab, tabs);
    const liveCount = matches.filter((m) => m.status === "LIVE").length;

    const setTab = useCallback(
        (tab: TournamentTabKey) => {
            setPickedTab(tab === "overview" ? null : tab);
            router.replace(tabHref(pathname ?? "", search?.toString() ?? "", tab), { scroll: false });
        },
        [router, pathname, search]
    );

    // A shared link to a tab that is not visible (yet) falls back to the overview.
    useEffect(() => {
        if (tournament && urlTab && active === "overview" && urlTab !== "overview") setTab("overview");
    }, [tournament, active, urlTab, setTab]);

    const champion = useMemo(
        () => (tournament ? deriveChampion(tournament, bracket.stages, standings.tables) : { champion: null, second: null, third: null }),
        [tournament, bracket.stages, standings.tables]
    );

    if (loading && !tournament) return <PageSkeleton />;
    if (notFound) {
        return (
            <Container maxWidth="sm" sx={{ py: 6 }} dir="rtl" data-testid="tournament-not-found">
                <Alert severity="info" sx={{ borderRadius: 2.5 }} action={<Button component={Link} href="/tournaments" color="inherit" size="small">לטורנירים</Button>}>
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
                    sx={{ borderRadius: 2.5 }}
                    action={<Button color="inherit" size="small" onClick={() => void reload()}>נסו שוב</Button>}
                >
                    {error?.status === 429
                        ? "יותר מדי בקשות כרגע. חכו רגע ונסו שוב."
                        : "לא הצלחנו לטעון את הטורניר."}
                </Alert>
            </Container>
        );
    }

    const t = tournament;
    const canScore = t.capabilities.canScore;
    const cta = heroCta(t, !!isSignedIn);
    const onScoreMatch = canScore ? setScoreMatch : undefined;

    return (
        <Container maxWidth="lg" sx={{ py: { xs: 2, md: 3.5 }, pb: { xs: 3, md: 6 } }} dir="rtl" data-testid="tournament-page">
            <TournamentHero
                tournament={t}
                cta={cta}
                champion={champion}
                liveCount={liveCount}
                onScoreCta={() => setTab("schedule")}
                onGoLive={() => setTab("schedule")}
            />
            <Box
                sx={(theme) => ({
                    position: "sticky",
                    top: { xs: 56, md: 64 },
                    zIndex: 10,
                    bgcolor: alpha(theme.palette.background.default, 0.92),
                    backdropFilter: "blur(12px)",
                    mt: 2.5,
                    // Bleed to the screen edge so the first/last tab is not clipped by the container gutter.
                    mx: { xs: -2, sm: -3, lg: 0 },
                    minWidth: 0,
                    maxWidth: "100%",
                    overflowX: "hidden",
                    borderBottom: 1,
                    borderColor: "divider",
                })}
            >
                <Tabs
                    value={active}
                    onChange={(_, v: TournamentTabKey) => setTab(v)}
                    variant="scrollable"
                    scrollButtons="auto"
                    allowScrollButtonsMobile
                    aria-label="אזורי הטורניר"
                    sx={{
                        width: "100%",
                        minWidth: 0,
                        maxWidth: "100%",
                        overflow: "visible !important",
                        "& .MuiTabs-indicator": { height: 3, borderRadius: "3px 3px 0 0" },
                        "& .MuiTab-root": { minWidth: 0, flexShrink: 0 },
                        // Phone width (390px): wrap so the last tab is on screen. Wider: one scrolling row.
                        "& .MuiTabs-scroller": {
                            // minWidth: 0 lets the row shrink inside a narrow RTL page; otherwise
                            // the scroller stays as wide as the tabs and the last one is clipped.
                            minWidth: 0,
                            width: "100%",
                            overflow: { xs: "visible !important", sm: "auto !important" },
                            whiteSpace: { xs: "normal", sm: "nowrap" },
                            WebkitOverflowScrolling: "touch",
                        },
                        "& .MuiTabs-flexContainer": {
                            px: { xs: 1, sm: 2, lg: 0 },
                            width: { xs: "100%", sm: "max-content" },
                            flexWrap: { xs: "wrap", sm: "nowrap" },
                        },
                    }}
                >
                    {tabs.map((k) => (
                        <Tab
                            key={k}
                            value={k}
                            label={TAB_LABEL[k]}
                            data-testid={`tournament-tab-${k}`}
                            sx={{ minHeight: 50, fontWeight: 800, fontSize: "0.95rem", px: { xs: 2, md: 2.5 } }}
                        />
                    ))}
                </Tabs>
            </Box>
            <UpdatedCue show={updated} testId="tournament-updated-cue" />
            <Box sx={{ mt: { xs: 2.5, md: 3 } }} role="tabpanel">
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
