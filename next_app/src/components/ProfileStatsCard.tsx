"use client";

import { useState } from "react";
import Link from "next/link";
import { alpha } from "@mui/material/styles";
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

const cardSx = { border: 1, borderColor: "divider", borderRadius: 2, p: { xs: 2, sm: 3 } } as const;

function Header({ isOwner, emoji }: { isOwner?: boolean; emoji?: string }) {
    return (
        <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            flexWrap="wrap"
            useFlexGap
            columnGap={1}
            rowGap={0.25}
            sx={{ mb: 1.5 }}
        >
            <Stack direction="row" alignItems="center" spacing={1}>
                {emoji ? <span aria-hidden>{emoji}</span> : <InsightsRoundedIcon color="primary" fontSize="small" />}
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
                    sx={{ color: "text.secondary", cursor: "help" }}
                >
                    <InfoOutlinedIcon sx={{ fontSize: 14 }} />
                    <Typography variant="caption" sx={{ whiteSpace: "nowrap" }}>
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
            sx={{ flex: 1, minWidth: 0, textAlign: "center", py: 1.25, borderRadius: 1.5, bgcolor: "action.hover" }}
        >
            <Typography
                component="div"
                sx={(theme) => ({
                    fontSize: 22,
                    fontWeight: 800,
                    lineHeight: 1.2,
                    fontVariantNumeric: "tabular-nums",
                    color: outcome ? outcomeSx(outcome)(theme).color : "text.primary",
                })}
            >
                {value}
            </Typography>
            <Typography variant="caption" color="text.secondary">
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
                <Skeleton variant="rounded" width={140} height={24} sx={{ mb: 2 }} />
                <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                    {[0, 1, 2, 3].map((i) => (
                        <Skeleton key={i} variant="rounded" height={64} sx={{ flex: 1 }} />
                    ))}
                </Stack>
                <Stack direction="row" spacing={1}>
                    <Skeleton variant="rounded" height={72} sx={{ flex: 1 }} />
                    <Skeleton variant="rounded" height={72} sx={{ flex: 1 }} />
                </Stack>
            </Box>
        );
    }

    if (state === "error") {
        return (
            <Box data-testid="profile-stats-error" sx={cardSx}>
                <Header isOwner={isOwner} />
                <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography variant="body2" color="text.secondary">
                        לא הצלחנו לטעון את הסטטיסטיקות
                    </Typography>
                    {onRetry && (
                        <Button size="small" variant="text" onClick={onRetry}>
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
                    <Stack data-testid="profile-stats-empty" alignItems="center" spacing={0.5} sx={{ py: 2, textAlign: "center" }}>
                        <Typography sx={{ fontSize: 32 }} aria-hidden>
                            ⚽🏀🎾
                        </Typography>
                        <Typography variant="subtitle1" fontWeight={700}>
                            עוד אין תוצאות
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            כשמנהל משחק יזין תוצאה למשחק ששיחקתם בו, הסטטיסטיקות יופיעו כאן.
                        </Typography>
                    </Stack>
                ) : (
                    <Typography data-testid="profile-stats-empty" variant="body2" color="text.secondary">
                        עוד אין תוצאות להצגה
                    </Typography>
                )}
            </Box>
        );
    }

    const ordered = [...sports].sort((a, b) => b.games - a.games);
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
                    sx={{ bgcolor: "action.hover", borderRadius: 1.5, px: 1.5, py: 1, mb: 1.5, color: "text.secondary" }}
                >
                    <VisibilityOffRoundedIcon sx={{ fontSize: 18 }} />
                    <Typography variant="caption" sx={{ flex: 1 }}>
                        מוסתר מאחרים, רק לך זה מוצג
                    </Typography>
                    <Typography variant="caption" component={Link} href={settingsHref} sx={{ color: "primary.main", fontWeight: 600, whiteSpace: "nowrap" }}>
                        שינוי בהגדרות
                    </Typography>
                </Stack>
            )}

            {ordered.length > 1 && (
                <Stack direction="row" spacing={1} sx={{ mb: 1.5, overflowX: "auto", pb: 0.5 }} role="group" aria-label="בחירת ענף">
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
                                label={`${SPORT_EMOJI[s.sport] || "🏅"} ${SPORT_MAPPING[s.sport] || s.sport} · ${s.games}`}
                                sx={{
                                    fontWeight: 600,
                                    flexShrink: 0,
                                    ...(selected ? { bgcolor: t.base, color: t.ink, "&:hover": { bgcolor: t.base } } : {}),
                                }}
                            />
                        );
                    })}
                </Stack>
            )}

            <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
                <Tile testId="profile-stats-tile-games" value={current.games} label="משחקים" />
                <Tile testId="profile-stats-tile-wins" value={current.wins} label="ניצחונות" outcome="WIN" />
                <Tile testId="profile-stats-tile-draws" value={current.draws} label="תיקו" outcome="DRAW" />
                <Tile testId="profile-stats-tile-losses" value={current.losses} label="הפסדים" outcome="LOSS" />
            </Stack>

            {sided > 0 && (
                <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
                    <Box
                        role="img"
                        aria-label={`${current.wins} ניצחונות, ${current.draws} תיקו, ${current.losses} הפסדים`}
                        sx={{ display: "flex", flex: 1, height: 8, borderRadius: 999, overflow: "hidden" }}
                    >
                        <Box sx={{ width: `${(current.wins / sided) * 100}%`, bgcolor: "success.main" }} />
                        <Box sx={{ width: `${(current.draws / sided) * 100}%`, bgcolor: "secondary.main" }} />
                        <Box sx={{ width: `${(current.losses / sided) * 100}%`, bgcolor: "action.disabled" }} />
                    </Box>
                    {pct !== null && (
                        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                            {pct}% ניצחונות
                        </Typography>
                    )}
                </Stack>
            )}

            {shownKeys.length > 0 && (
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1 }}>
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
                                    p: 1.5,
                                    borderRadius: 1.5,
                                    bgcolor: t.palette.mode === "dark" ? alpha(sportTheme.deep, 0.35) : sportTheme.tint,
                                    color: t.palette.mode === "dark" ? sportTheme.glow : sportTheme.deep,
                                })}
                            >
                                <Typography
                                    component="div"
                                    sx={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }}
                                >
                                    {total}
                                </Typography>
                                <Typography variant="caption" component="div" sx={{ color: "inherit" }}>
                                    {caption}
                                </Typography>
                                {!binary && perGame != null && (
                                    <Typography variant="caption" component="div" sx={{ color: "inherit", opacity: 0.8 }}>
                                        {formatPerGame(perGame)} למשחק
                                    </Typography>
                                )}
                            </Box>
                        );
                    })}
                </Box>
            )}

            {!showAll && statKeys.length > INITIAL_STAT_TILES && (
                <Button data-testid="profile-stats-show-all" size="small" variant="text" onClick={() => setShowAll(true)} sx={{ mt: 1 }}>
                    הצגת כל הסטטיסטיקות
                </Button>
            )}
        </Box>
    );
}
