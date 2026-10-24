"use client";

import Link from "next/link";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import EditRounded from "@mui/icons-material/EditRounded";
import EventAvailableRounded from "@mui/icons-material/EventAvailableRounded";
import StadiumRounded from "@mui/icons-material/StadiumRounded";
import { alpha } from "@mui/material/styles";
import MatchStatusChip from "./MatchStatusChip";
import ScoreCluster from "./ScoreCluster";
import SlotLabel from "./SlotLabel";
import { changedFlashSx } from "./UpdatedCue";
import { hasScore, scoreAriaLabel, setsWon, winnerSide, type SlotContext } from "@/utils/tournament";
import { timeLabel } from "@/utils/tournamentViews";
import type { TournamentMatch } from "@/types/tournament";

export interface MatchCardProps {
    match: TournamentMatch;
    context?: SlotContext;
    /** Stage / group / round caption (e.g. "בית א׳ · מחזור 2"). */
    caption?: string;
    /** Highlights the card with the my-team bar when the match involves this team. */
    myTeamId?: string | null;
    /** Show the score (edit) button. The caller decides (canScore and IN_PROGRESS). */
    canScore?: boolean;
    onScore?: (match: TournamentMatch) => void;
    /** Show the add-to-calendar button (scheduled, with a time, my team). */
    onAddToCalendar?: (match: TournamentMatch) => void;
    /** Href of the match detail page. Omit for a non-navigating card. */
    href?: string;
    /** Flash the card (id in changedMatchIds). */
    changed?: boolean;
    /** Ids of teams that withdrew after scheduling (their name is struck through). */
    withdrawnTeamIds?: ReadonlySet<string>;
    testId?: string;
}

/** Schedule / overview / team-page match card (spec 7.2). Props only. */
export default function MatchCard({
    match,
    context,
    caption,
    myTeamId,
    canScore,
    onScore,
    onAddToCalendar,
    href,
    changed,
    withdrawnTeamIds,
    testId,
}: MatchCardProps) {
    const id = testId ?? `match-card-${match.id}`;
    const status = match.status;
    const cancelled = status === "CANCELLED";
    const postponed = status === "POSTPONED";
    const live = status === "LIVE";
    const forfeit = status === "FORFEIT";
    const winner = winnerSide(match);
    const isMine = !!myTeamId && (match.home.teamId === myTeamId || match.away.teamId === myTeamId);
    const sets = match.details?.sets ?? null;
    const tennis = !!sets && sets.length > 0;
    const [hSets, aSets] = setsWon(sets);
    const showScore = hasScore(match);
    const time = match.scheduledAt ? timeLabel(match.scheduledAt) : null;
    const homeName = match.home.team?.name ?? "";
    const awayName = match.away.team?.name ?? "";
    const forfeitLoser = forfeit && winner ? (winner === "home" ? "away" : "home") : null;
    const withdrawn = (side: "home" | "away") => {
        const tid = match[side].teamId;
        return !!tid && !!withdrawnTeamIds?.has(tid);
    };

    const placeholder = time ?? "–";

    const meta = [`#${match.number}`, time, match.courtLabel].filter(Boolean);
    const body = (
        <Stack spacing={1.25}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
                    <Typography
                        variant="caption"
                        color="text.secondary"
                        noWrap
                        sx={{ fontWeight: 600, textDecoration: postponed ? "line-through" : "none" }}
                    >
                        {meta.join(" · ")}
                    </Typography>
                    {match.courtLabel && <StadiumRounded aria-hidden sx={{ fontSize: 14, color: "text.secondary" }} />}
                </Stack>
                <MatchStatusChip status={status} testId={`${id}-status`} />
            </Stack>

            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                <Box sx={{ flex: "1 1 0", minWidth: 0, maxWidth: "calc(50% - 40px)" }}>
                    <SlotLabel
                        slot={match.home}
                        context={context}
                        lines={1}
                        emphasis={winner === "home" ? "winner" : winner === "away" ? "loser" : undefined}
                        strikeThrough={cancelled || withdrawn("home")}
                        testId={`${id}-home`}
                    />
                </Box>
                <ScoreCluster
                    homeScore={showScore ? (tennis ? hSets : match.homeScore) : null}
                    awayScore={showScore ? (tennis ? aSets : match.awayScore) : null}
                    homePenalties={match.homePenalties}
                    awayPenalties={match.awayPenalties}
                    sets={tennis && showScore ? sets : null}
                    winner={winner}
                    size="md"
                    placeholder={showScore ? undefined : placeholder}
                    ariaLabel={showScore ? scoreAriaLabel(homeName, awayName, match.homeScore, match.awayScore) : undefined}
                    testId={`${id}-score`}
                />
                <Box sx={{ flex: "1 1 0", minWidth: 0, maxWidth: "calc(50% - 40px)" }}>
                    <SlotLabel
                        slot={match.away}
                        context={context}
                        lines={1}
                        emphasis={winner === "away" ? "winner" : winner === "home" ? "loser" : undefined}
                        strikeThrough={cancelled || withdrawn("away")}
                        testId={`${id}-away`}
                    />
                </Box>
            </Stack>

            {showScore && match.homePenalties != null && match.awayPenalties != null && (
                <Typography variant="caption" color="text.secondary" align="center" sx={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                    {`פנדלים ${match.homePenalties} : ${match.awayPenalties}`}
                </Typography>
            )}
            {forfeitLoser && (
                <Typography variant="caption" color="text.secondary" align="center" fontWeight={500}>
                    {`${match[forfeitLoser].team?.name ?? ""} (הפסד טכני)`}
                </Typography>
            )}
            {postponed && (
                <Typography variant="caption" color="text.secondary" align="center" fontWeight={500}>
                    מועד חדש ייקבע
                </Typography>
            )}

            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ minHeight: 24 }}>
                <Typography variant="caption" color="text.secondary" noWrap fontWeight={500}>
                    {isMine ? (caption ? `הקבוצה שלך · ${caption}` : "הקבוצה שלך") : caption ?? ""}
                </Typography>
            </Stack>
        </Stack>
    );

    const showCalendar = !!onAddToCalendar && !!match.scheduledAt && status === "SCHEDULED";
    const showScoreBtn = !!canScore && !!onScore && !cancelled;

    return (
        <Box sx={changedFlashSx(!!changed)} style={{ borderRadius: 12 }}>
            <Card
                variant="outlined"
                data-testid={id}
                data-status={status}
                data-mine={isMine ? "true" : undefined}
                sx={(theme) => ({
                    position: "relative",
                    borderRadius: 2.5,
                    p: 1.75,
                    bgcolor: "background.paper",
                    boxShadow: theme.shadows[1],
                    opacity: cancelled ? 0.6 : 1,
                    borderColor: live ? alpha(theme.palette.error.main, 0.45) : "divider",
                    // 3px start-edge bar for my team (RTL aware via logical property)
                    borderInlineStart: isMine ? `3px solid ${theme.palette.primary.main}` : undefined,
                    transition: "box-shadow 0.15s ease, border-color 0.15s ease",
                    "&:hover": href
                        ? {
                              boxShadow: theme.shadows[2],
                              borderColor: live ? alpha(theme.palette.error.main, 0.6) : alpha(theme.palette.primary.main, 0.35),
                          }
                        : undefined,
                })}
            >
                {href ? (
                    <Box
                        component={Link}
                        href={href}
                        aria-label={`משחק ${match.number}: ${homeName} – ${awayName}`}
                        sx={{ color: "inherit", textDecoration: "none", display: "block", "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 } }}
                    >
                        {body}
                    </Box>
                ) : (
                    body
                )}
                {(showCalendar || showScoreBtn) && (
                    <Stack direction="row" spacing={0.5} sx={{ position: "absolute", insetInlineEnd: 6, bottom: 6 }}>
                        {showCalendar && (
                            <IconButton
                                size="small"
                                aria-label="הוספה ליומן"
                                data-testid={`match-card-calendar-${match.id}`}
                                onClick={() => onAddToCalendar?.(match)}
                                sx={{ width: 40, height: 40 }}
                            >
                                <EventAvailableRounded fontSize="small" />
                            </IconButton>
                        )}
                        {showScoreBtn && (
                            <IconButton
                                size="small"
                                aria-label={status === "FINISHED" || status === "FORFEIT" ? "עדכון תוצאה" : "הזנת תוצאה"}
                                data-testid={`match-card-edit-${match.id}`}
                                onClick={() => onScore?.(match)}
                                sx={{ width: 40, height: 40 }}
                            >
                                <EditRounded fontSize="small" />
                            </IconButton>
                        )}
                    </Stack>
                )}
            </Card>
        </Box>
    );
}
