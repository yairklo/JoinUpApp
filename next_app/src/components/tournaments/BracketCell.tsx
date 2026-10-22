"use client";

import Link from "next/link";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import EmojiEventsRounded from "@mui/icons-material/EmojiEventsRounded";
import { alpha } from "@mui/material/styles";
import MatchStatusChip from "./MatchStatusChip";
import SlotLabel from "./SlotLabel";
import { changedFlashSx } from "./UpdatedCue";
import { getSportTheme } from "@/utils/sports";
import { describeSlot, hasScore, winnerSide, type MatchSide, type SlotContext } from "@/utils/tournament";
import { timeLabel } from "@/utils/tournamentViews";
import type { TournamentMatch } from "@/types/tournament";

export interface BracketCellProps {
    match: TournamentMatch;
    context?: SlotContext;
    sport?: string | null;
    /** Cell width in px (200 default, 240 for small brackets and 5-set tennis). */
    width?: number | string;
    /** Half-height ghost cell for a bye: only the advancing team (spec 9.2). */
    ghost?: boolean;
    /** This cell is on the highlighted team's path (accent border). */
    onPath?: boolean;
    /** Another path is pinned and this cell is not on it (70% opacity). */
    dimmed?: boolean;
    /** The team whose slot gets the my-team bar. */
    myTeamId?: string | null;
    /** Hide the "#n · time" caption (low zoom). */
    hideCaption?: boolean;
    /** Show a trophy (final of a completed tournament). */
    trophy?: boolean;
    changed?: boolean;
    /** Navigates to the match detail. */
    href?: string;
    onOpen?: (match: TournamentMatch) => void;
    /** Hover / focus / click on a team row (path highlight). */
    onTeamPointer?: (teamId: string | null, kind: "hover" | "pin") => void;
}

export const BRACKET_CELL_W = 200;

/** One match in the bracket (spec 9.2): home row on top, score at the end edge. Props only. */
export default function BracketCell({
    match,
    context,
    sport,
    width = BRACKET_CELL_W,
    ghost,
    onPath,
    dimmed,
    myTeamId,
    hideCaption,
    trophy,
    changed,
    href,
    onOpen,
    onTeamPointer,
}: BracketCellProps) {
    const id = match.id;
    const winner = winnerSide(match);
    const sets = match.details?.sets ?? null;
    const tennis = !!sets && sets.length > 0;
    const showScore = hasScore(match);
    const cancelled = match.status === "CANCELLED";
    const live = match.status === "LIVE";
    const sportTheme = getSportTheme(sport);
    const caption = [`#${match.number}`, match.scheduledAt ? timeLabel(match.scheduledAt) : null].filter(Boolean).join(" · ");

    const row = (side: MatchSide) => {
        const slot = match[side];
        const isWinner = winner === side;
        const view = describeSlot(slot, context);
        const score = side === "home" ? match.homeScore : match.awayScore;
        const pen = side === "home" ? match.homePenalties : match.awayPenalties;
        const bothPen = match.homePenalties != null && match.awayPenalties != null;
        const isMine = !!myTeamId && slot.teamId === myTeamId;
        const mySets = tennis && sets ? sets.map((s) => (side === "home" ? s[0] : s[1])) : null;
        const otherSets = tennis && sets ? sets.map((s) => (side === "home" ? s[1] : s[0])) : null;
        return (
            <Stack
                direction="row"
                alignItems="center"
                spacing={0.75}
                data-testid={`bracket-cell-slot-${id}-${side}`}
                data-winner={isWinner ? "true" : undefined}
                onMouseEnter={() => slot.teamId && onTeamPointer?.(slot.teamId, "hover")}
                onMouseLeave={() => slot.teamId && onTeamPointer?.(null, "hover")}
                onClick={(e) => {
                    if (slot.teamId && onTeamPointer) {
                        e.preventDefault();
                        e.stopPropagation();
                        onTeamPointer(slot.teamId, "pin");
                    }
                }}
                sx={{
                    position: "relative",
                    height: 36,
                    px: 1,
                    minWidth: 0,
                    color: !isWinner && winner ? "text.secondary" : "text.primary",
                }}
            >
                {(isWinner || isMine) && (
                    <Box
                        aria-hidden
                        sx={(theme) => ({
                            position: "absolute",
                            insetInlineStart: 0,
                            top: 4,
                            bottom: 4,
                            width: 2,
                            borderRadius: 1,
                            bgcolor: isWinner
                                ? theme.palette.mode === "dark"
                                    ? sportTheme.glow
                                    : sportTheme.deep
                                : theme.palette.primary.main,
                        })}
                    />
                )}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <SlotLabel
                        slot={slot}
                        context={context}
                        size={24}
                        lines={1}
                        emphasis={isWinner ? "winner" : winner ? "loser" : undefined}
                        strikeThrough={cancelled}
                        testId={`bracket-cell-name-${id}-${side}`}
                    />
                </Box>
                {view.kind === "team" && showScore && !tennis && score != null && (
                    <Stack direction="row" alignItems="baseline" spacing={0.25} sx={{ fontVariantNumeric: "tabular-nums" }}>
                        <Typography component="span" sx={{ fontSize: 16, fontWeight: isWinner ? 800 : 600, fontVariantNumeric: "tabular-nums" }}>
                            {score}
                        </Typography>
                        {bothPen && pen != null && (
                            <Typography component="span" variant="caption" color="text.secondary">
                                ({pen})
                            </Typography>
                        )}
                    </Stack>
                )}
                {tennis && showScore && mySets && otherSets && (
                    <Stack direction="row" sx={{ fontVariantNumeric: "tabular-nums" }}>
                        {mySets.map((n, i) => (
                            <Box key={i} component="span" sx={{ width: 18, textAlign: "center", fontSize: 13, fontWeight: n > otherSets[i] ? 800 : 400 }}>
                                {n}
                            </Box>
                        ))}
                    </Stack>
                )}
            </Stack>
        );
    };

    const inner = ghost ? (
        <Box sx={{ opacity: 0.9 }}>{row(match.home.team ? "home" : "away")}</Box>
    ) : (
        <>
            {row("home")}
            <Box sx={{ borderTop: 1, borderColor: "divider" }} />
            {row("away")}
        </>
    );

    const shell = (
        <Box
            data-testid={`bracket-cell-${id}`}
            data-status={match.status}
            data-ghost={ghost ? "true" : undefined}
            sx={[
                (theme) => ({
                    position: "relative",
                    width,
                    height: ghost ? 36 : 72,
                    borderRadius: ghost ? 2 : 3,
                    border: ghost ? "1px dashed" : "1px solid",
                    borderColor: onPath
                        ? theme.palette.mode === "dark"
                            ? sportTheme.glow
                            : sportTheme.deep
                        : live
                          ? alpha(theme.palette.error.main, 0.4)
                          : "divider",
                    borderWidth: onPath ? 2 : 1,
                    bgcolor: ghost ? "transparent" : "background.paper",
                    opacity: cancelled ? 0.6 : dimmed ? 0.7 : 1,
                    overflow: "visible",
                }),
                changedFlashSx(!!changed) as never,
            ]}
        >
            {inner}
            {trophy && (
                <EmojiEventsRounded
                    aria-label="גמר"
                    sx={{ position: "absolute", insetInlineEnd: -10, top: -10, fontSize: 20, color: "warning.main", bgcolor: "background.paper", borderRadius: "50%" }}
                />
            )}
        </Box>
    );

    const label = `משחק ${match.number}`;
    return (
        <Box sx={{ position: "relative", width }}>
            {!hideCaption && (
                <Stack
                    direction="row"
                    alignItems="center"
                    spacing={0.5}
                    sx={{ position: "absolute", top: ghost ? -17 : -17, insetInlineStart: 4, height: 16 }}
                >
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: 11 }}>
                        {ghost ? "פטור" : caption}
                    </Typography>
                    <MatchStatusChip status={match.status} testId={`bracket-cell-status-${id}`} />
                </Stack>
            )}
            {href ? (
                <Box
                    component={Link}
                    href={href}
                    aria-label={label}
                    sx={{ display: "block", color: "inherit", textDecoration: "none", "&:focus-visible > div": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 } }}
                    onClick={onOpen ? () => onOpen(match) : undefined}
                >
                    {shell}
                </Box>
            ) : (
                shell
            )}
        </Box>
    );
}
