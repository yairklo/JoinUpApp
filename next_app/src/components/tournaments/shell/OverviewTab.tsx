"use client";

import { useMemo } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import MatchCard from "../MatchCard";
import StandingsTable from "../StandingsTable";
import UpdatedCue from "../UpdatedCue";
import OpenInMapLinks from "@/components/OpenInMapLinks";
import { buildMapLinks } from "@joinup/shared/mapLinks";
import { TabError, TabSkeleton } from "../tabs/TabStates";
import { useStandings, useTournamentSchedule } from "@/hooks/tournaments";
import type { TournamentDetail, TournamentMatch } from "@/types/tournament";
import { FORMAT_LABEL, shortDate, type TournamentTabKey } from "./shellModel";

/** `rules.tiebreak` stores the full enum. Short keys are kept for older rows. */
function tiebreakLabel(key: string, sport: string | undefined): string {
    const basket = sport === "BASKETBALL";
    switch (key) {
        case "HEAD_TO_HEAD":
        case "H2H":
            return "מפגש ישיר";
        case "GOAL_DIFFERENCE":
        case "GD":
            return basket ? "הפרש סלים" : "הפרש שערים";
        case "GOALS_FOR":
        case "GF":
            return basket ? "סלי זכות" : "שערי זכות";
        case "WINS":
            return "ניצחונות";
        case "FAIR_PLAY":
            return "משחק הוגן";
        case "DRAW_LOT":
        case "DRAW":
            return "הגרלה";
        default:
            return key;
    }
}

function Section({ title, children, action, testId }: { title: string; children: React.ReactNode; action?: React.ReactNode; testId?: string }) {
    return (
        <Box component="section" data-testid={testId}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.25 }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                    <Box sx={{ width: 4, height: 18, borderRadius: 1, bgcolor: "primary.main" }} />
                    <Typography variant="h6" component="h2" sx={{ fontWeight: 800, letterSpacing: "-0.01em" }}>
                        {title}
                    </Typography>
                </Stack>
                {action}
            </Stack>
            {children}
        </Box>
    );
}

function upcoming(matches: readonly TournamentMatch[]): TournamentMatch[] {
    return matches
        .filter((m) => m.status === "SCHEDULED" && m.scheduledAt && m.home.teamId && m.away.teamId)
        .sort((a, b) => new Date(a.scheduledAt as string).getTime() - new Date(b.scheduledAt as string).getTime());
}

/** Overview tab (spec 2.5). Sections with nothing to show are omitted. */
export default function OverviewTab({ tournament: t, onGoTab, onScoreMatch }: { tournament: TournamentDetail; onGoTab: (tab: TournamentTabKey) => void; onScoreMatch?: (m: TournamentMatch) => void }) {
    const { matches, matchNumberById, groupNameById, loading, error, reload, updated } = useTournamentSchedule(t.id);
    const standings = useStandings(t.id, { live: false });
    const myTeamId = t.myTeam?.id ?? null;
    const context = useMemo(() => ({ matchNumberById, groupNameById, locale: "he" as const }), [matchNumberById, groupNameById]);

    const live = matches.filter((m) => m.status === "LIVE");
    const next = upcoming(matches);
    const mine = myTeamId ? next.find((m) => m.home.teamId === myTeamId || m.away.teamId === myTeamId) : undefined;
    const soon = next.filter((m) => m.id !== mine?.id).slice(0, 3);
    const venueLocation = {
        lat: t.fieldLat,
        lng: t.fieldLng,
        customLocation: t.customLocation,
        address: t.fieldLocation,
        name: t.fieldName,
    };
    const venueLabel = (t.customLocation || t.fieldLocation || t.fieldName || "").trim();
    const canOpenMap = !!buildMapLinks(venueLocation);
    const tables = standings.tables.slice(0, 2);
    const rules = t.rules;
    const scoring = t.status === "IN_PROGRESS" && t.capabilities.canScore;
    const card = (m: TournamentMatch) => (
        <MatchCard
            key={m.id}
            match={m}
            context={context}
            myTeamId={myTeamId}
            canScore={scoring}
            onScore={onScoreMatch}
            href={`/tournaments/${t.id}/matches/${m.id}`}
        />
    );

    if (loading && matches.length === 0 && !t.description) return <div data-testid="overview-tab"><TabSkeleton rows={3} /></div>;

    return (
        <Stack spacing={3.5} data-testid="overview-tab">
            <UpdatedCue show={updated} />
            {error && matches.length === 0 && <TabError error={error} onRetry={reload} />}
            {mine && (
                <Section title="המשחק הבא שלך" testId="tournament-overview-next-match">
                    {card(mine)}
                </Section>
            )}
            {live.length > 0 && <Section title="חי עכשיו">{<Stack spacing={1.25}>{live.map(card)}</Stack>}</Section>}
            {soon.length > 0 && (
                <Section title="משחקים קרובים" action={<Button size="small" onClick={() => onGoTab("schedule")}>ללוח המלא</Button>}>
                    <Stack spacing={1.25}>{soon.map(card)}</Stack>
                </Section>
            )}
            {tables.length > 0 && (
                <Section title="טבלה" action={<Button size="small" onClick={() => onGoTab("standings")}>לטבלה המלאה</Button>}>
                    <Stack spacing={2}>
                        {tables.map((tb) => (
                            <StandingsTable
                                key={`${tb.stageId}-${tb.groupId ?? ""}`}
                                table={{ ...tb, rows: tb.rows.slice(0, 4) }}
                                myTeamId={myTeamId}
                                mode="compact"
                                sport={t.sport}
                                tournamentCompleted={t.status === "COMPLETED"}
                            />
                        ))}
                    </Stack>
                </Section>
            )}
            <Section title="על הטורניר">
                <Stack spacing={2}>
                    {(t.description || venueLabel || canOpenMap) && (
                        <Box
                            sx={(theme) => ({
                                p: 2.25,
                                borderRadius: 2.5,
                                border: "1px solid",
                                borderColor: "divider",
                                bgcolor: "background.paper",
                                boxShadow: theme.shadows[1],
                            })}
                        >
                            {t.description && (
                                <Typography sx={{ whiteSpace: "pre-wrap", lineHeight: 1.65 }}>
                                    {t.description}
                                </Typography>
                            )}
                            {(venueLabel || canOpenMap) && (
                                <Stack
                                    direction="row"
                                    alignItems="center"
                                    justifyContent="space-between"
                                    spacing={1.5}
                                    sx={{ mt: t.description ? 1.75 : 0, pt: t.description ? 1.75 : 0, borderTop: t.description ? 1 : 0, borderColor: "divider" }}
                                >
                                    {venueLabel ? (
                                        <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 0 }}>
                                            {`📍 ${venueLabel}`}
                                        </Typography>
                                    ) : <Box />}
                                    {canOpenMap && <OpenInMapLinks location={venueLocation} variant="link" />}
                                </Stack>
                            )}
                        </Box>
                    )}
                    <Box
                        sx={(theme) => ({
                            p: 2.5,
                            borderRadius: 2.5,
                            border: "1px solid",
                            borderColor: "divider",
                            bgcolor: "background.paper",
                            boxShadow: theme.shadows[1],
                        })}
                        data-testid="tournament-rules"
                    >
                        <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>
                            {`חוקים · ${FORMAT_LABEL[t.format]}`}
                        </Typography>
                        <Stack spacing={0.75} sx={{ color: "text.secondary" }}>
                            {rules?.points && (
                                <Typography variant="body2" fontWeight={500}>
                                    ניצחון <bdi dir="ltr">{rules.points.win}</bdi>
                                    {" · תיקו "}
                                    <bdi dir="ltr">{rules.points.draw}</bdi>
                                    {" · הפסד "}
                                    <bdi dir="ltr">{rules.points.loss}</bdi>
                                </Typography>
                            )}
                            <Typography variant="body2" fontWeight={500}>
                                <bdi dir="ltr">{t.startersPerTeam}</bdi>
                                {" בהרכב · "}
                                <bdi dir="ltr">{`${t.minPlayersPerTeam}–${t.maxPlayersPerTeam}`}</bdi>
                                {" שחקנים בקבוצה"}
                            </Typography>
                            {rules?.legs === 2 && <Typography variant="body2" fontWeight={500}>שני משחקים בכל מפגש</Typography>}
                            {rules?.bestOf && (
                                <Typography variant="body2" fontWeight={500}>
                                    עד <bdi dir="ltr">{rules.bestOf}</bdi> מערכות
                                </Typography>
                            )}
                        </Stack>
                        {rules?.tiebreak && rules.tiebreak.length > 0 && (
                            <>
                                <Divider sx={{ my: 1.75 }} />
                                <Typography variant="body2" sx={{ mb: 1, fontWeight: 800 }}>
                                    סדר שוברי שוויון
                                </Typography>
                                <Box
                                    component="ol"
                                    sx={(theme) => ({
                                        m: 0,
                                        ps: 3,
                                        py: 1,
                                        pe: 2,
                                        borderRadius: 2,
                                        bgcolor: alpha(theme.palette.text.primary, theme.palette.mode === "dark" ? 0.03 : 0.02),
                                        "& li": { py: 0.25 },
                                    })}
                                >
                                    {rules.tiebreak.map((k) => (
                                        <li key={k}>
                                            <Typography variant="body2" fontWeight={500}>
                                                {tiebreakLabel(k, t.sport)}
                                            </Typography>
                                        </li>
                                    ))}
                                </Box>
                            </>
                        )}
                    </Box>
                </Stack>
            </Section>
            {(t.status === "DRAFT" || t.status === "REGISTRATION_OPEN" || t.status === "REGISTRATION_CLOSED") && (
                <Section title="הרשמה" testId="tournament-registration-info">
                    <Box
                        sx={(theme) => ({
                            p: 2.25,
                            borderRadius: 2.5,
                            border: "1px solid",
                            borderColor: "divider",
                            bgcolor: "background.paper",
                            boxShadow: theme.shadows[1],
                        })}
                    >
                        <Typography variant="body2" fontWeight={500} sx={{ lineHeight: 1.65 }}>
                            {t.registrationOpensAt && (
                                <>
                                    נפתחת ב-<bdi dir="ltr">{shortDate(t.registrationOpensAt)}</bdi>.{" "}
                                </>
                            )}
                            {t.registrationClosesAt && (
                                <>
                                    נסגרת ב-<bdi dir="ltr">{shortDate(t.registrationClosesAt)}</bdi>.{" "}
                                </>
                            )}
                            {t.requireApproval && "הקבוצות מאושרות ע״י המארגן."}
                        </Typography>
                    </Box>
                </Section>
            )}
        </Stack>
    );
}
