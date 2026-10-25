"use client";

import { useState } from "react";
import Link from "next/link";
import { alpha } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";
import { getStatLabel } from "@joinup/shared/matchStats";
import type { ResultOutcome, SportStatsAggregate } from "@/types/matchResult";
import { SPORT_EMOJI, SPORT_MAPPING, getSportTheme } from "@/utils/sports";
import { outcomeSx } from "@/components/matchOutcomeStyles";
import { formatPerGame, orderedStatKeys, winRatePct } from "@/utils/matchStatsFormat";

export interface ProfileStatsCardProps {
    state: "loading" | "error" | "ready";
    /** false (hidden/private) renders nothing at all. */
    visible: boolean;
    isOwner?: boolean;
    /** Owner has hideMatchStats on (server `ownerHidden`). */
    ownerHidden?: boolean;
    sports: SportStatsAggregate[];
    selectedSport?: string | null;
    onSelectSport?: (sport: string) => void;
    onRetry?: () => void;
    settingsHref?: string;
}

const INITIAL_STAT_TILES = 4;
const SOURCE_HINT = "התוצאות מוזנות על ידי מנהלי המשחקים ולא נבדקות.";

const cardSx = (theme: Theme) => ({
    border: 1,
    borderColor: "divider",
    borderRadius: 2.5,
    bgcolor: "background.paper",
    boxShadow: theme.shadows[2],
    p: { xs: 2.25, sm: 3 },
});

function Header({ isOwner, emoji }: { isOwner?: boolean; emoji?: string }) {
    return (
        <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            flexWrap="wrap"
            useFlexGap
            columnGap={1}
            rowGap={0.5}
            sx={{ mb: 2 }}
        >
            <Stack direction="row" alignItems="center" spacing={1}>
                <Box
                    sx={(t) => ({
                        width: 32,
                        height: 32,
                        borderRadius: 2,
                        display: "grid",
                        placeItems: "center",
                        bgcolor: alpha(t.palette.primary.main, 0.12),
                        color: "primary.main",
                        fontSize: 16,
                    })}
                >
                    {emoji ? <span aria-hidden>{emoji}</span> : <InsightsRoundedIcon fontSize="small" />}
                </Box>
                <Typography variant="h6" fontWeight={800} sx={{ letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>
                    {isOwner ? "הסטטיסטיקות שלי" : "סטטיסטיקות"}
                </Typography>
            </Stack>
            <Tooltip title={SOURCE_HINT} enterTouchDelay={0}>
                <Stack
                    direction="row"
                    alignItems="center"
                    spacing={0.5}
                    tabIndex={0}
                    aria-label={`לפי מנהלי המשחקים. ${SOURCE_HINT}`}
                    sx={{
                        color: "text.secondary",
                        cursor: "help",
                        px: 1,
                        py: 0.35,
                        borderRadius: 999,
                        bgcolor: "action.hover",
                    }}
                >
                    <InfoOutlinedIcon sx={{ fontSize: 14 }} />
                    <Typography variant="caption" sx={{ whiteSpace: "nowrap", fontWeight: 500 }}>
                        לפי מנהלי המשחקים
                    </Typography>
                </Stack>
            </Tooltip>
        </Stack>
    );
}

function Tile({ testId, value, label, outcome }: { testId: string; value: number; label: string; outcome?: ResultOutcome }) {
    return (
        <Box
            data-testid={testId}
            sx={(t) => ({
                flex: 1,
                minWidth: 0,
                textAlign: "center",
                py: 1.5,
                px: 0.75,
                borderRadius: 2,
                bgcolor: t.palette.mode === "dark" ? alpha(t.palette.text.primary, 0.04) : "action.hover",
                border: "1px solid",
                borderColor: "divider",
            })}
        >
            <Typography
                component="div"
                sx={(theme) => ({
                    fontSize: { xs: 22, sm: 24 },
                    fontWeight: 800,
                    lineHeight: 1.15,
                    letterSpacing: "-0.02em",
                    fontVariantNumeric: "tabular-nums",
                    color: outcome ? outcomeSx(outcome)(theme).color : "text.primary",
                })}
            >
                {value}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: "block", mt: 0.25 }}>
                {label}
            </Typography>
        </Box>
    );
}

/** Presentational profile stats section (design spec section 5). */
export default function ProfileStatsCard({
    state,
    visible,
    isOwner,
    ownerHidden,
    sports,
    selectedSport,
    onSelectSport,
    onRetry,
    settingsHref = "/profile/settings",
}: ProfileStatsCardProps) {
    const [showAll, setShowAll] = useState(false);

    if (!visible) return null;

    if (state === "loading") {
        return (
            <Box data-testid="profile-stats-loading" sx={cardSx} aria-busy="true">
                <Skeleton variant="rounded" width={160} height={28} sx={{ mb: 2, borderRadius: 1.5 }} />
                <Stack direction="row" spacing={1.25} sx={{ mb: 2 }}>
                    {[0, 1, 2, 3].map((i) => (
                        <Skeleton key={i} variant="rounded" height={68} sx={{ flex: 1, borderRadius: 2 }} />
                    ))}
                </Stack>
                <Stack direction="row" spacing={1.25}>
                    <Skeleton variant="rounded" height={76} sx={{ flex: 1, borderRadius: 2 }} />
                    <Skeleton variant="rounded" height={76} sx={{ flex: 1, borderRadius: 2 }} />
                </Stack>
            </Box>
        );
    }

    if (state === "error") {
        return (
            <Box data-testid="profile-stats-error" sx={cardSx}>
                <Header isOwner={isOwner} />
                <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    spacing={1.5}
                    sx={(t) => ({
                        p: 1.5,
                        borderRadius: 2,
                        bgcolor: alpha(t.palette.error.main, 0.08),
                        border: "1px solid",
                        borderColor: alpha(t.palette.error.main, 0.2),
                    })}
                >
                    <Typography variant="body2" color="text.secondary" fontWeight={500}>
                        לא הצלחנו לטעון את הסטטיסטיקות
                    </Typography>
                    {onRetry && (
                        <Button size="small" variant="outlined" color="error" onClick={onRetry}>
                            נסו שוב
                        </Button>
                    )}
                </Stack>
            </Box>
        );
    }

    if (sports.length === 0) {
        return (
            <Box data-testid="profile-stats" sx={cardSx}>
                <Header isOwner={isOwner} />
                {isOwner ? (
                    <Stack
                        data-testid="profile-stats-empty"
                        alignItems="center"
                        spacing={1}
                        sx={(t) => ({
                            py: 3.5,
                            px: 2,
                            textAlign: "center",
                            borderRadius: 2,
                            bgcolor: t.palette.mode === "dark" ? alpha(t.palette.text.primary, 0.03) : "action.hover",
                            border: "1px dashed",
                            borderColor: "divider",
                        })}
                    >
                        <Typography sx={{ fontSize: 32, lineHeight: 1 }} aria-hidden>
                            ⚽🏀🎾
                        </Typography>
                        <Typography variant="subtitle1" fontWeight={800}>
                            עוד אין תוצאות
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 360 }}>
                            כשמנהל משחק יזין תוצאה למשחק ששיחקתם בו, הסטטיסטיקות יופיעו כאן.
                        </Typography>
                    </Stack>
                ) : (
                    <Typography data-testid="profile-stats-empty" variant="body2" color="text.secondary" sx={{ py: 1 }}>
                        עוד אין תוצאות להצגה
                    </Typography>
                )}
            </Box>
        );
    }

    const ordered = [...sports].sort((a, b) => (b.gamesPlayed ?? b.games) - (a.gamesPlayed ?? a.games));
    const current = ordered.find((s) => s.sport === selectedSport) ?? ordered[0];
    const sportTheme = getSportTheme(current.sport);
    const sided = current.wins + current.draws + current.losses;
    const pct = winRatePct(current.wins, current.draws, current.losses);
    const statKeys = orderedStatKeys(current.sport, current.totals);
    const shownKeys = showAll ? statKeys : statKeys.slice(0, INITIAL_STAT_TILES);

    return (
        <Box data-testid="profile-stats" sx={cardSx}>
            <Header isOwner={isOwner} emoji={ordered.length === 1 ? SPORT_EMOJI[current.sport] : undefined} />

            {isOwner && ownerHidden && (
                <Stack
                    data-testid="profile-stats-hidden-owner"
                    direction="row"
                    alignItems="center"
                    spacing={1}
                    sx={(t) => ({
                        bgcolor: t.palette.mode === "dark" ? alpha(t.palette.text.primary, 0.06) : "action.hover",
                        border: "1px solid",
                        borderColor: "divider",
                        borderRadius: 2,
                        px: 1.75,
                        py: 1,
                        mb: 2,
                        color: "text.secondary",
                    })}
                >
                    <VisibilityOffRoundedIcon sx={{ fontSize: 18 }} />
                    <Typography variant="caption" sx={{ flex: 1, fontWeight: 500 }}>
                        מוסתר מאחרים, רק לך זה מוצג
                    </Typography>
                    <Typography
                        variant="caption"
                        component={Link}
                        href={settingsHref}
                        sx={{ color: "primary.main", fontWeight: 700, whiteSpace: "nowrap", textDecoration: "none", "&:hover": { textDecoration: "underline" } }}
                    >
                        שינוי בהגדרות
                    </Typography>
                </Stack>
            )}

            {ordered.length > 1 && (
                <Stack direction="row" spacing={1} sx={{ mb: 2, overflowX: "auto", pb: 0.5 }} role="group" aria-label="בחירת ענף">
                    {ordered.map((s) => {
                        const selected = s.sport === current.sport;
                        const t = getSportTheme(s.sport);
                        return (
                            <Chip
                                key={s.sport}
                                data-testid={`profile-stats-sport-${s.sport}`}
                                clickable
                                onClick={() => {
                                    setShowAll(false);
                                    onSelectSport?.(s.sport);
                                }}
                                aria-pressed={selected}
                                label={`${SPORT_EMOJI[s.sport] || "🏅"} ${SPORT_MAPPING[s.sport] || s.sport} · ${s.gamesPlayed ?? s.games}`}
                                sx={(theme) => ({
                                    fontWeight: 700,
                                    flexShrink: 0,
                                    height: 34,
                                    px: 0.5,
                                    ...(selected
                                        ? {
                                              bgcolor: t.base,
                                              color: t.ink,
                                              boxShadow: `0 4px 12px -2px ${alpha(t.base, 0.45)}`,
                                              "&:hover": { bgcolor: t.base },
                                          }
                                        : {
                                              bgcolor: theme.palette.mode === "dark" ? alpha(theme.palette.text.primary, 0.06) : "action.hover",
                                              border: "1px solid",
                                              borderColor: "divider",
                                          }),
                                })}
                            />
                        );
                    })}
                </Stack>
            )}

            <Stack direction="row" spacing={{ xs: 1, sm: 1.25 }} sx={{ mb: 2 }}>
                <Tile testId="profile-stats-tile-games" value={current.gamesPlayed ?? current.games} label="משחקים" />
                <Tile testId="profile-stats-tile-wins" value={current.wins} label="ניצחונות" outcome="WIN" />
                <Tile testId="profile-stats-tile-draws" value={current.draws} label="תיקו" outcome="DRAW" />
                <Tile testId="profile-stats-tile-losses" value={current.losses} label="הפסדים" outcome="LOSS" />
            </Stack>

            {(current.roundWins ?? 0) + (current.roundDraws ?? 0) + (current.roundLosses ?? 0) > sided && (
                <Typography variant="caption" color="text.secondary" data-testid="profile-stats-rounds" sx={{ display: "block", mb: 1.5 }}>
                    סיבובים: {current.roundWins ?? 0}–{current.roundDraws ?? 0}–{current.roundLosses ?? 0} (נ׳–ת׳–ה׳). ערב עם כמה משחקים נספר פעם אחת כמשחק; הניצחונות למעלה הם משחקים שלמים.
                </Typography>
            )}

            {sided > 0 && (
                <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2.25 }}>
                    <Box
                        role="img"
                        aria-label={`${current.wins} ניצחונות, ${current.draws} תיקו, ${current.losses} הפסדים`}
                        sx={{ display: "flex", flex: 1, height: 8, borderRadius: 999, overflow: "hidden", bgcolor: "action.hover" }}
                    >
                        <Box sx={{ width: `${(current.wins / sided) * 100}%`, bgcolor: "success.main", transition: "width 250ms ease" }} />
                        <Box sx={{ width: `${(current.draws / sided) * 100}%`, bgcolor: "secondary.main", transition: "width 250ms ease" }} />
                        <Box sx={{ width: `${(current.losses / sided) * 100}%`, bgcolor: "action.disabled", transition: "width 250ms ease" }} />
                    </Box>
                    {pct !== null && (
                        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                            {pct}% ניצחונות
                        </Typography>
                    )}
                </Stack>
            )}

            {shownKeys.length > 0 && (
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1.25 }}>
                    {shownKeys.map((key) => {
                        const total = current.totals[key];
                        const binary = key === "mvp" || key === "cleanSheet";
                        // Binary keys read as a count ("3 פעמים שחקן המשחק"); a single time drops "פעמים".
                        const caption = binary
                            ? `${total === 1 ? "" : "פעמים "}${key === "mvp" ? "שחקן המשחק" : "רשת נקייה"}`
                            : getStatLabel(current.sport, key, "he", total);
                        const perGame = current.perGame[key];
                        return (
                            <Box
                                key={key}
                                data-testid={`profile-stats-stat-${key}`}
                                sx={(t) => ({
                                    p: 1.75,
                                    borderRadius: 2,
                                    border: "1px solid",
                                    borderColor: t.palette.mode === "dark" ? alpha(sportTheme.glow, 0.18) : alpha(sportTheme.deep, 0.14),
                                    bgcolor: t.palette.mode === "dark" ? alpha(sportTheme.deep, 0.35) : sportTheme.tint,
                                    color: t.palette.mode === "dark" ? sportTheme.glow : sportTheme.deep,
                                })}
                            >
                                <Typography
                                    component="div"
                                    sx={{ fontSize: 24, fontWeight: 800, lineHeight: 1.15, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}
                                >
                                    {total}
                                </Typography>
                                <Typography variant="caption" component="div" sx={{ color: "inherit", fontWeight: 700, mt: 0.25 }}>
                                    {caption}
                                </Typography>
                                {!binary && perGame != null && (
                                    <Typography variant="caption" component="div" sx={{ color: "inherit", opacity: 0.8, fontWeight: 500 }}>
                                        {formatPerGame(perGame)} למשחק
                                    </Typography>
                                )}
                            </Box>
                        );
                    })}
                </Box>
            )}

            {!showAll && statKeys.length > INITIAL_STAT_TILES && (
                <Button data-testid="profile-stats-show-all" size="small" variant="text" onClick={() => setShowAll(true)} sx={{ mt: 1.5 }}>
                    הצגת כל הסטטיסטיקות
                </Button>
            )}
        </Box>
    );
}
