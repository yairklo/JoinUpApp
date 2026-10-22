"use client";

import { useMemo } from "react";
import Link from "next/link";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import EmojiEventsRounded from "@mui/icons-material/EmojiEventsRounded";
import EventAvailableRounded from "@mui/icons-material/EventAvailableRounded";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import IosShareRounded from "@mui/icons-material/IosShareRounded";
import StadiumRounded from "@mui/icons-material/StadiumRounded";
import MatchStatusChip from "./MatchStatusChip";
import ScoreCluster from "./ScoreCluster";
import SlotLabel from "./SlotLabel";
import UpdatedCue from "./UpdatedCue";
import { TabError } from "./tabs/TabStates";
import { useTournament, useTournamentSchedule, useTournamentTeams } from "@/hooks/tournaments";
import { getSportTheme } from "@/utils/sports";
import { hasScore, scoreAriaLabel, setsWon, winnerSide, type SlotContext } from "@/utils/tournament";
import { buildMatchesIcs, dayHeaderLabel, dayKey, stageCaption, timeLabel } from "@/utils/tournamentViews";
import type { TeamMember, TournamentMatch } from "@/types/tournament";

export interface TournamentMatchDetailProps {
    tournamentId: string;
    matchId: string;
    /** Opens the score entry sheet (agent D). The button shows only for scorekeepers while IN_PROGRESS. */
    onScoreMatch?: (match: TournamentMatch) => void;
    /** Opens the match edit sheet (manager+). */
    onEditMatch?: (match: TournamentMatch) => void;
}

function Roster({ title, members, testId }: { title: string; members: TeamMember[]; testId: string }) {
    const accepted = members.filter((m) => m.status === "ACCEPTED");
    return (
        <Accordion disableGutters variant="outlined" data-testid={testId} sx={{ borderRadius: 2, "&:before": { display: "none" } }}>
            <AccordionSummary expandIcon={<ExpandMoreRounded />}>
                <Typography fontWeight={700}>{`${title} (${accepted.length})`}</Typography>
            </AccordionSummary>
            <AccordionDetails>
                {accepted.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                        אין שחקנים רשומים
                    </Typography>
                ) : (
                    <Stack spacing={0.75} component="ul" sx={{ m: 0, p: 0, listStyle: "none" }}>
                        {accepted.map((m) => (
                            <Stack component="li" key={m.userId} direction="row" spacing={1} alignItems="center">
                                <Typography variant="body2" color="text.secondary" sx={{ width: 24, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                                    {m.jerseyNumber ?? ""}
                                </Typography>
                                <Typography variant="body2" noWrap>
                                    {m.name}
                                </Typography>
                            </Stack>
                        ))}
                    </Stack>
                )}
            </AccordionDetails>
        </Accordion>
    );
}

/** Match detail (spec 10): scoreboard, sets, penalties, path context, rosters, role-based actions. */
export default function TournamentMatchDetail({ tournamentId, matchId, onScoreMatch, onEditMatch }: TournamentMatchDetailProps) {
    const { tournament } = useTournament(tournamentId);
    const { stages, matches, matchNumberById, groupNameById, loading, error, reload, updated } = useTournamentSchedule(tournamentId);
    const { teams } = useTournamentTeams(tournamentId);
    const match = matches.find((m) => m.id === matchId) ?? null;
    const context: SlotContext = useMemo(() => ({ matchNumberById, groupNameById, locale: "he" }), [matchNumberById, groupNameById]);
    const sportTheme = getSportTheme(tournament?.sport);
    const back = (
        <Button component={Link} href={`/tournaments/${tournamentId}`} size="small" sx={{ alignSelf: "flex-start" }}>
            חזרה לטורניר
        </Button>
    );

    if (loading && !match) {
        return (
            <Container maxWidth="md" sx={{ py: 3 }} data-testid="match-detail">
                <Skeleton variant="rounded" height={200} data-testid="match-detail-loading" />
            </Container>
        );
    }
    if (error && !match) {
        return (
            <Container maxWidth="md" sx={{ py: 3 }} data-testid="match-detail">
                <Stack spacing={1}>
                    <TabError error={error} onRetry={reload} />
                    {back}
                </Stack>
            </Container>
        );
    }
    if (!match) {
        return (
            <Container maxWidth="md" sx={{ py: 3 }} data-testid="match-detail">
                <Stack spacing={1} alignItems="flex-start">
                    <Typography variant="h6" fontWeight={800}>
                        המשחק לא נמצא
                    </Typography>
                    {back}
                </Stack>
            </Container>
        );
    }

    const winner = winnerSide(match);
    const sets = match.details?.sets ?? null;
    const tennis = !!sets && sets.length > 0;
    const [hSets, aSets] = setsWon(sets);
    const showScore = hasScore(match);
    const homeName = match.home.team?.name ?? "";
    const awayName = match.away.team?.name ?? "";
    const finished = match.status === "FINISHED" || match.status === "FORFEIT";
    const forfeitLoser = match.status === "FORFEIT" && winner ? (winner === "home" ? match.away : match.home) : null;
    const inProgress = tournament?.status === "IN_PROGRESS";
    const canScore = !!tournament?.capabilities.canScore && inProgress && match.status !== "CANCELLED";
    const canManage = !!tournament?.capabilities.canManage;
    const myTeamId = tournament?.myTeam?.id;
    const isMyMatch = !!myTeamId && (match.home.teamId === myTeamId || match.away.teamId === myTeamId);
    const caption = [`#${match.number}`, stageCaption(match, stages)].filter(Boolean).join(" · ");
    const accentOn = (theme: { palette: { mode: string } }) => (theme.palette.mode === "dark" ? sportTheme.glow : sportTheme.deep);

    const nextWinner = matches.find((m) => [m.home, m.away].some((s) => s.source && "matchId" in s.source && s.source.type === "WINNER_OF" && s.source.matchId === match.id));
    const nextLoser = matches.find((m) => [m.home, m.away].some((s) => s.source && "matchId" in s.source && s.source.type === "LOSER_OF" && s.source.matchId === match.id));
    const otherSlot = (m: TournamentMatch, type: "WINNER_OF" | "LOSER_OF") => {
        const mine = [m.home, m.away].find((s) => s.source && "matchId" in s.source && s.source.type === type && s.source.matchId === match.id);
        return mine === m.home ? m.away : m.home;
    };
    const homeTeam = teams.find((t) => t.id === match.home.teamId);
    const awayTeam = teams.find((t) => t.id === match.away.teamId);

    const share = async () => {
        const url = typeof window !== "undefined" ? window.location.href : "";
        try {
            if (navigator.share) await navigator.share({ title: `${homeName} – ${awayName}`, url });
            else await navigator.clipboard.writeText(url);
        } catch {
            /* user cancelled */
        }
    };
    const addToCalendar = () => {
        const ics = buildMatchesIcs([
            { id: match.id, scheduledAt: match.scheduledAt, summary: `${tournament?.title ?? "טורניר"}: ${homeName} – ${awayName}`, location: match.courtLabel },
        ]);
        const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `match-${match.number}.ics`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    return (
        <Container maxWidth="md" sx={{ py: 3 }} data-testid="match-detail">
            <Stack spacing={2}>
                {back}
                <UpdatedCue show={updated} />
                <Card variant="outlined" sx={{ borderRadius: 2, borderTop: 4, borderTopColor: accentOn }}>
                    <CardContent>
                        <Stack spacing={2}>
                            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} useFlexGap flexWrap="wrap">
                                <Typography variant="caption" color="text.secondary">
                                    {caption}
                                </Typography>
                                <MatchStatusChip status={match.status} />
                            </Stack>
                            {(match.scheduledAt || match.courtLabel) && (
                                <Stack direction="row" spacing={1.5} alignItems="center" useFlexGap flexWrap="wrap">
                                    {match.scheduledAt && (
                                        <Typography
                                            variant="body2"
                                            sx={{ textDecoration: match.status === "POSTPONED" ? "line-through" : "none" }}
                                        >
                                            {`${dayHeaderLabel(dayKey(match.scheduledAt))} · ${timeLabel(match.scheduledAt)}`}
                                        </Typography>
                                    )}
                                    {match.courtLabel && (
                                        <Stack direction="row" spacing={0.5} alignItems="center">
                                            <StadiumRounded aria-hidden sx={{ fontSize: 16, color: "text.secondary" }} />
                                            <Typography variant="body2">{match.courtLabel}</Typography>
                                        </Stack>
                                    )}
                                </Stack>
                            )}

                            <Box sx={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: { xs: 1, sm: 2 } }}>
                                <Stack alignItems="flex-end" spacing={0.75} sx={{ minWidth: 0 }}>
                                    <SlotLabel slot={match.home} context={context} size={40} lines={2} emphasis={winner === "home" ? "winner" : winner === "away" ? "loser" : undefined} strikeThrough={match.status === "CANCELLED"} testId="match-detail-home" />
                                    {winner === "home" && finished && <Chip size="small" icon={<EmojiEventsRounded />} label="ניצחון" color="success" variant="outlined" />}
                                </Stack>
                                <Box data-testid="match-detail-score">
                                    <ScoreCluster
                                        homeScore={showScore ? (tennis ? hSets : match.homeScore) : null}
                                        awayScore={showScore ? (tennis ? aSets : match.awayScore) : null}
                                        homePenalties={match.homePenalties}
                                        awayPenalties={match.awayPenalties}
                                        winner={winner}
                                        size="lg"
                                        placeholder={match.scheduledAt ? timeLabel(match.scheduledAt) : "–"}
                                        ariaLabel={showScore ? scoreAriaLabel(homeName, awayName, match.homeScore, match.awayScore) : undefined}
                                    />
                                </Box>
                                <Stack alignItems="flex-start" spacing={0.75} sx={{ minWidth: 0 }}>
                                    <SlotLabel slot={match.away} context={context} size={40} lines={2} emphasis={winner === "away" ? "winner" : winner === "home" ? "loser" : undefined} strikeThrough={match.status === "CANCELLED"} testId="match-detail-away" />
                                    {winner === "away" && finished && <Chip size="small" icon={<EmojiEventsRounded />} label="ניצחון" color="success" variant="outlined" />}
                                </Stack>
                            </Box>

                            {showScore && match.homePenalties != null && match.awayPenalties != null && (
                                <Typography align="center" variant="body2" color="text.secondary" data-testid="match-detail-penalties" sx={{ fontVariantNumeric: "tabular-nums" }}>
                                    {"פנדלים "}
                                    <Box component="span" sx={{ fontWeight: match.homePenalties > match.awayPenalties ? 800 : 400 }}>{match.homePenalties}</Box>
                                    {" : "}
                                    <Box component="span" sx={{ fontWeight: match.awayPenalties > match.homePenalties ? 800 : 400 }}>{match.awayPenalties}</Box>
                                </Typography>
                            )}
                            {forfeitLoser && (
                                <Typography align="center" variant="body2" color="text.secondary">
                                    {`${forfeitLoser.team?.name ?? ""} הפסידה טכנית`}
                                </Typography>
                            )}
                            {match.status === "POSTPONED" && (
                                <Typography align="center" variant="body2" color="text.secondary">
                                    מועד חדש ייקבע
                                </Typography>
                            )}

                            {tennis && sets && (
                                <Box data-testid="match-detail-sets" sx={{ display: "grid", gridTemplateColumns: `minmax(0,1fr) repeat(${sets.length}, 40px)`, alignItems: "center", rowGap: 0.5, fontVariantNumeric: "tabular-nums" }}>
                                    <span />
                                    {sets.map((_, i) => (
                                        <Typography key={i} variant="caption" color="text.secondary" align="center">{`מע׳ ${i + 1}`}</Typography>
                                    ))}
                                    {(["home", "away"] as const).map((side) => (
                                        <Box key={side} sx={{ display: "contents" }}>
                                            <Typography variant="body2" noWrap fontWeight={winner === side ? 800 : 600}>
                                                {side === "home" ? homeName : awayName}
                                            </Typography>
                                            {sets.map((s, i) => {
                                                const mine = side === "home" ? s[0] : s[1];
                                                const other = side === "home" ? s[1] : s[0];
                                                return (
                                                    <Typography key={i} align="center" sx={{ fontSize: 18, fontWeight: mine > other ? 800 : 600, color: mine > other ? "text.primary" : "text.secondary" }}>
                                                        {mine}
                                                    </Typography>
                                                );
                                            })}
                                        </Box>
                                    ))}
                                </Box>
                            )}
                        </Stack>
                    </CardContent>
                </Card>

                {(nextWinner || nextLoser) && (
                    <Stack spacing={0.5} data-testid="match-detail-path">
                        {nextWinner && (
                            <Typography variant="body2" color="text.secondary">
                                {"המנצחת תעלה למשחק "}
                                <Link href={`/tournaments/${tournamentId}/matches/${nextWinner.id}`}>{`#${nextWinner.number}`}</Link>
                                {" נגד "}
                                <b>{(otherSlot(nextWinner, "WINNER_OF").team?.name) ?? "ייקבע בהמשך"}</b>
                            </Typography>
                        )}
                        {nextLoser && (
                            <Typography variant="body2" color="text.secondary">
                                {"המפסידה תשחק במשחק "}
                                <Link href={`/tournaments/${tournamentId}/matches/${nextLoser.id}`}>{`#${nextLoser.number}`}</Link>
                            </Typography>
                        )}
                    </Stack>
                )}

                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                    {canScore && onScoreMatch && (
                        <Button variant="contained" onClick={() => onScoreMatch(match)} data-testid="match-detail-enter-score">
                            {finished ? "עדכון תוצאה" : "הזנת תוצאה"}
                        </Button>
                    )}
                    {canManage && onEditMatch && (
                        <Button variant="outlined" onClick={() => onEditMatch(match)} data-testid="match-detail-edit">
                            עריכת משחק
                        </Button>
                    )}
                    {isMyMatch && match.scheduledAt && match.status === "SCHEDULED" && (
                        <Button startIcon={<EventAvailableRounded />} onClick={addToCalendar}>
                            הוספה ליומן
                        </Button>
                    )}
                    <Button startIcon={<IosShareRounded />} onClick={share}>
                        שיתוף
                    </Button>
                </Stack>

                {(homeTeam || awayTeam) && (
                    <Stack spacing={1}>
                        {homeTeam && <Roster title={homeTeam.name} members={homeTeam.members} testId="match-detail-roster-home" />}
                        {awayTeam && <Roster title={awayTeam.name} members={awayTeam.members} testId="match-detail-roster-away" />}
                    </Stack>
                )}
                {error && <Alert severity="warning">העדכון האחרון נכשל. מוצגים הנתונים האחרונים שנטענו.</Alert>}
            </Stack>
        </Container>
    );
}
