"use client";

import { useMemo } from "react";
import Link from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import MatchCard from "../MatchCard";
import StandingsTable from "../StandingsTable";
import UpdatedCue from "../UpdatedCue";
import { TabError, TabSkeleton } from "../tabs/TabStates";
import { useStandings, useTournamentSchedule } from "@/hooks/tournaments";
import type { TournamentDetail, TournamentMatch } from "@/types/tournament";
import { FORMAT_LABEL, shortDate, type TournamentTabKey } from "./shellModel";

const TIEBREAK_LABEL: Record<string, string> = {
    H2H: "ראש בראש",
    GD: "הפרש שערים",
    GF: "שערי זכות",
    WINS: "מספר ניצחונות",
    DRAW: "הגרלה",
};

function Section({ title, children, action, testId }: { title: string; children: React.ReactNode; action?: React.ReactNode; testId?: string }) {
    return (
        <Box component="section" data-testid={testId}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <Typography variant="h6" component="h2" sx={{ fontWeight: 800 }}>{title}</Typography>
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
        <Stack spacing={3} data-testid="overview-tab">
            <UpdatedCue show={updated} />
            {error && matches.length === 0 && <TabError error={error} onRetry={reload} />}
            {mine && (
                <Section title="המשחק הבא שלך" testId="tournament-overview-next-match">
                    {card(mine)}
                </Section>
            )}
            {live.length > 0 && <Section title="חי עכשיו">{<Stack spacing={1}>{live.map(card)}</Stack>}</Section>}
            {soon.length > 0 && (
                <Section title="משחקים קרובים" action={<Button size="small" onClick={() => onGoTab("schedule")}>ללוח המלא</Button>}>
                    <Stack spacing={1}>{soon.map(card)}</Stack>
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
                <Stack spacing={1.5}>
                    {t.description && <Typography sx={{ whiteSpace: "pre-wrap" }}>{t.description}</Typography>}
                    {t.customLocation && (
                        <Typography variant="body2">
                            {`📍 ${t.customLocation}`}{" "}
                            <Link href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.customLocation)}`} target="_blank" rel="noopener noreferrer">
                                פתיחה במפה
                            </Link>
                        </Typography>
                    )}
                    <Box sx={{ p: 2, borderRadius: 2, border: 1, borderColor: "divider" }} data-testid="tournament-rules">
                        <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5 }}>{`חוקים · ${FORMAT_LABEL[t.format]}`}</Typography>
                        {rules?.points && <Typography variant="body2">{`ניצחון ${rules.points.win} · תיקו ${rules.points.draw} · הפסד ${rules.points.loss}`}</Typography>}
                        <Typography variant="body2">{`${t.startersPerTeam} בהרכב · ${t.minPlayersPerTeam}–${t.maxPlayersPerTeam} שחקנים בקבוצה`}</Typography>
                        {rules?.legs === 2 && <Typography variant="body2">שני משחקים בכל מפגש</Typography>}
                        {rules?.bestOf && <Typography variant="body2">{`עד ${rules.bestOf} מערכות`}</Typography>}
                        {rules?.tiebreak && rules.tiebreak.length > 0 && (
                            <>
                                <Typography variant="body2" sx={{ mt: 1, fontWeight: 700 }}>סדר שוברי שוויון</Typography>
                                <Box component="ol" sx={{ m: 0, ps: 3 }}>
                                    {rules.tiebreak.map((k) => (
                                        <li key={k}><Typography variant="body2">{TIEBREAK_LABEL[k] ?? k}</Typography></li>
                                    ))}
                                </Box>
                            </>
                        )}
                    </Box>
                </Stack>
            </Section>
            {(t.status === "DRAFT" || t.status === "REGISTRATION_OPEN" || t.status === "REGISTRATION_CLOSED") && (
                <Section title="הרשמה" testId="tournament-registration-info">
                    <Typography variant="body2">
                        {t.registrationOpensAt && `נפתחת ב-${shortDate(t.registrationOpensAt)}. `}
                        {t.registrationClosesAt && `נסגרת ב-${shortDate(t.registrationClosesAt)}. `}
                        {t.requireApproval && "הקבוצות מאושרות ע״י המארגן."}
                    </Typography>
                </Section>
            )}
        </Stack>
    );
}
