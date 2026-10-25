"use client";

import React from "react";
import NextLink from "next/link";
import Card from "@mui/material/Card";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import PaymentsRoundedIcon from "@mui/icons-material/PaymentsRounded";
import EventRepeatRoundedIcon from "@mui/icons-material/EventRepeatRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import BoltRoundedIcon from "@mui/icons-material/BoltRounded";

import SportCover from "@/components/ui/SportCover";
import { SPORT_MAPPING, getSportTheme } from "@/utils/sports";
import SportIcon from "@/components/ui/SportIcon";
import { formatHebrewDateRelative, toIsoDateInput } from "@/utils/hebrewDate";
import { DRAWING_TITLE } from "@joinup/shared/gameViewerCopy";

function formatEndTime(startTime: string, hours: number | undefined): string {
    const dur = typeof hours === "number" && Number.isFinite(hours) ? hours : 1;
    const [h, m] = startTime.split(":").map((n) => parseInt(n, 10));
    const base = new Date(1970, 0, 1, isNaN(h) ? 0 : h, isNaN(m) ? 0 : m, 0, 0);
    base.setMinutes(base.getMinutes() + Math.round(dur * 60));
    return `${String(base.getHours()).padStart(2, "0")}:${String(base.getMinutes()).padStart(2, "0")}`;
}

/** "היום · 20:00" / "מחר · 20:00" / "בעוד 3 ימים" / "הסתיים", counted in Jerusalem calendar days. */
function countdownLabel(date: string | undefined, time: string, end: string): string | null {
    const iso = toIsoDateInput(date);
    if (!iso) return null;
    const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
    const days = Math.round((Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${todayIso}T12:00:00Z`)) / 86_400_000);
    if (Number.isNaN(days)) return null;
    if (days < 0) return "הסתיים";
    if (days === 0) {
        const nowHm = new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false });
        if (nowHm >= time && nowHm < end) return "משחקים עכשיו!";
        if (end > time && nowHm >= end) return "הסתיים";
        return `היום · ${time}`;
    }
    if (days === 1) return `מחר · ${time}`;
    return `בעוד ${days} ימים`;
}

const glassChipSx = {
    height: 28,
    fontSize: "0.78rem",
    fontWeight: 700,
    color: "#fff",
    bgcolor: "rgba(255,255,255,0.16)",
    border: "1px solid rgba(255,255,255,0.24)",
    backdropFilter: "blur(10px)",
} as const;

export type HeroViewerState = "joined" | "waitlisted" | "lottery" | "drawing" | "pending" | null;

function StatTile({
    icon,
    label,
    value,
    caption,
    accent,
    children,
}: {
    icon: React.ReactNode;
    label: string;
    value: React.ReactNode;
    caption?: React.ReactNode;
    accent: string;
    children?: React.ReactNode;
}) {
    return (
        <Box
            sx={(t) => ({
                minWidth: 0,
                p: { xs: 1.25, sm: 1.75 },
                borderRadius: 3,
                bgcolor: alpha(accent, t.palette.mode === "dark" ? 0.14 : 0.08),
                border: t.palette.mode === "dark" ? "1px solid" : "none",
                borderColor: alpha(accent, 0.28),
            })}
        >
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.75, minWidth: 0 }}>
                <Box
                    sx={{
                        width: { xs: 26, sm: 30 },
                        height: { xs: 26, sm: 30 },
                        borderRadius: "50%",
                        bgcolor: accent,
                        color: "#fff",
                        display: "grid",
                        placeItems: "center",
                        flexShrink: 0,
                        "& svg": { fontSize: { xs: 15, sm: 17 } },
                    }}
                >
                    {icon}
                </Box>
                <Typography variant="caption" fontWeight={700} color="text.secondary" noWrap>
                    {label}
                </Typography>
            </Stack>
            <Typography
                component="div"
                noWrap
                sx={{
                    fontWeight: 800,
                    fontSize: { xs: "1.05rem", sm: "1.35rem" },
                    lineHeight: 1.15,
                    letterSpacing: "-0.01em",
                    fontVariantNumeric: "tabular-nums",
                }}
            >
                {value}
            </Typography>
            {caption && (
                <Typography variant="caption" color="text.secondary" fontWeight={600} noWrap component="div" sx={{ mt: 0.25 }}>
                    {caption}
                </Typography>
            )}
            {children}
        </Box>
    );
}

/**
 * Game page header: a full sport-art hero (game/series/field photo under a sport wash) carrying
 * the title, venue, a countdown and the viewer's status, then three tinted stat tiles
 * (when / players / price) and the viewer's actions.
 */
export default function GameHero({
    time,
    date,
    durationHours,
    title,
    subtitle,
    fieldHref,
    seriesHref,
    currentPlayers,
    maxPlayers,
    sport,
    teamSize,
    price,
    coverImage,
    viewerState = null,
    finished = false,
    children,
}: {
    time: string;
    date?: string;
    durationHours?: number;
    title: string;
    subtitle?: string;
    fieldHref?: string;
    /** Set when the game belongs to a recurring group; renders a prominent link to its page. */
    seriesHref?: string;
    currentPlayers: number;
    maxPlayers: number;
    sport?: string;
    teamSize?: number | null;
    price?: number | null;
    /** Game, series or field photo shown under the sport wash. */
    coverImage?: string | null;
    viewerState?: HeroViewerState;
    /** Finished game: static "המשחק הסתיים" chip, no seat counter / capacity warnings. */
    finished?: boolean;
    children?: React.ReactNode;
}) {
    const theme = getSportTheme(sport);
    const end = formatEndTime(time, durationHours);
    const pct = maxPlayers > 0 ? Math.min((currentPlayers / maxPlayers) * 100, 100) : 0;
    const isFull = currentPlayers >= maxPlayers;
    const spotsLeft = Math.max(0, maxPlayers - currentPlayers);
    const almostFull = !isFull && spotsLeft <= 2;
    const sportLabel = sport ? SPORT_MAPPING[sport] : undefined;
    const isFree = !price || price <= 0;
    const countdown = finished ? null : countdownLabel(date, time, end);

    const statusPill =
        viewerState === "joined" ? (
            <Chip
                size="small"
                icon={<CheckCircleRoundedIcon sx={{ fontSize: "17px !important", color: `${theme.base} !important` }} />}
                label="אתה בפנים"
                sx={{ ...glassChipSx, color: theme.ink, bgcolor: "#fff", border: "none" }}
            />
        ) : viewerState === "lottery" ? (
            <Chip size="small" label="נרשמת להגרלה" sx={glassChipSx} />
        ) : viewerState === "drawing" ? (
            <Chip size="small" label={DRAWING_TITLE} sx={glassChipSx} />
        ) : viewerState === "waitlisted" ? (
            <Chip size="small" label="ברשימת המתנה" sx={glassChipSx} />
        ) : viewerState === "pending" ? (
            <Chip size="small" label="ממתין לאישור" sx={glassChipSx} />
        ) : finished ? null : isFull ? (
            <Chip size="small" label="מלא" sx={{ ...glassChipSx, bgcolor: "#ef4444", border: "none" }} />
        ) : almostFull ? (
            <Chip
                size="small"
                label={spotsLeft === 1 ? "מקום אחרון!" : `נשארו ${spotsLeft}!`}
                sx={{ ...glassChipSx, bgcolor: "#f59e0b", color: "#1f1300", border: "none" }}
            />
        ) : null;

    return (
        <Card
            elevation={0}
            dir="rtl"
            sx={{
                borderRadius: { xs: 5, md: 6 },
                overflow: "hidden",
                border: "1px solid",
                borderColor: "divider",
                boxShadow: `0 1px 2px rgba(15,23,42,0.05), 0 24px 48px -24px ${alpha(theme.deep, 0.45)}`,
            }}
        >
            <SportCover sport={sport} image={coverImage} height={{ xs: 240, md: 300 }} lineOpacity={0.36}>
                <Box
                    sx={{
                        position: "absolute",
                        inset: 0,
                        p: { xs: 2, md: 3.5 },
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        color: "#fff",
                        minWidth: 0,
                        // Extra bottom scrim so the title stays legible over bright photos.
                        background: "linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.38) 100%)",
                    }}
                >
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                            {sportLabel && (
                                <Chip
                                    size="small"
                                    icon={<SportIcon sport={sport} sx={{ fontSize: "16px !important", color: `${theme.glow} !important`, marginInlineStart: "6px !important" }} />}
                                    label={sportLabel}
                                    sx={glassChipSx}
                                />
                            )}
                            {teamSize ? <Chip size="small" label={`${teamSize}X${teamSize}`} sx={glassChipSx} dir="ltr" /> : null}
                        </Stack>
                        {statusPill}
                    </Stack>

                    <Box sx={{ minWidth: 0 }}>
                        {finished && (
                            <Chip size="small" label="המשחק הסתיים" sx={{ ...glassChipSx, mb: 1 }} />
                        )}
                        {countdown && (
                            <Box
                                suppressHydrationWarning
                                sx={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 0.5,
                                    mb: 1,
                                    px: 1.25,
                                    py: 0.4,
                                    borderRadius: 999,
                                    bgcolor: theme.glow,
                                    color: theme.ink,
                                    fontWeight: 800,
                                    fontSize: { xs: "0.78rem", md: "0.85rem" },
                                    boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
                                }}
                            >
                                <BoltRoundedIcon sx={{ fontSize: 16 }} />
                                <span suppressHydrationWarning>{countdown}</span>
                            </Box>
                        )}
                        <Typography
                            component="h1"
                            sx={{
                                fontWeight: 900,
                                fontSize: { xs: "1.75rem", sm: "2.2rem", md: "2.8rem" },
                                lineHeight: 1.05,
                                letterSpacing: "-0.03em",
                                textShadow: "0 2px 18px rgba(0,0,0,0.35)",
                                display: "-webkit-box",
                                overflow: "hidden",
                                WebkitBoxOrient: "vertical",
                                WebkitLineClamp: 2,
                            }}
                        >
                            {title || "משחק ללא שם"}
                        </Typography>
                        {subtitle && (
                            <Stack
                                direction="row"
                                spacing={0.5}
                                alignItems="center"
                                component={fieldHref ? NextLink : "div"}
                                href={fieldHref}
                                sx={{
                                    mt: 0.75,
                                    width: "fit-content",
                                    maxWidth: "100%",
                                    color: "rgba(255,255,255,0.9)",
                                    textDecoration: "none",
                                    ...(fieldHref && { "&:hover": { color: "#fff", textDecoration: "underline" } }),
                                }}
                            >
                                <PlaceRoundedIcon sx={{ fontSize: 18, color: theme.glow, flexShrink: 0 }} />
                                <Typography noWrap sx={{ fontSize: { xs: "0.9rem", md: "1rem" }, fontWeight: 600 }}>
                                    {subtitle}
                                </Typography>
                            </Stack>
                        )}
                    </Box>
                </Box>
            </SportCover>

            <Box sx={{ p: { xs: 2, md: 2.5 }, pb: { xs: 2.5, md: 3 }, display: "flex", flexDirection: "column", gap: { xs: 1.5, md: 2 } }}>
                {seriesHref && (
                    <Box
                        component={NextLink}
                        href={seriesHref}
                        sx={(t) => ({
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            px: 1.75,
                            py: 1,
                            borderRadius: 999,
                            textDecoration: "none",
                            color: "primary.main",
                            bgcolor: alpha(t.palette.primary.main, 0.08),
                            transition: "background-color 0.2s ease",
                            "&:hover": { bgcolor: alpha(t.palette.primary.main, 0.14) },
                        })}
                    >
                        <EventRepeatRoundedIcon fontSize="small" />
                        <Typography component="span" sx={{ fontWeight: 800, flex: 1, fontSize: "0.9rem" }}>
                            חלק מקבוצה קבועה · לדף הקבוצה
                        </Typography>
                        <ChevronLeftRoundedIcon fontSize="small" />
                    </Box>
                )}

                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: { xs: 1, sm: 1.5 } }}>
                    <StatTile
                        accent={theme.base}
                        icon={<ScheduleRoundedIcon />}
                        label="מתי"
                        value={
                            <Box component="span" dir="ltr" sx={{ unicodeBidi: "isolate" }}>
                                {time}
                                <Box component="span" sx={{ color: "text.secondary", fontWeight: 600, fontSize: "0.7em", display: { xs: "none", sm: "inline" } }}>
                                    –{end}
                                </Box>
                            </Box>
                        }
                        caption={date ? <span suppressHydrationWarning>{formatHebrewDateRelative(date)}</span> : undefined}
                    />
                    <StatTile
                        accent={isFull ? "#ef4444" : almostFull ? "#f59e0b" : theme.base}
                        icon={<GroupsRoundedIcon />}
                        label="שחקנים"
                        value={
                            <>
                                {currentPlayers}
                                {!finished && <Box component="span" sx={{ color: "text.secondary", fontWeight: 600 }}>/{maxPlayers}</Box>}
                            </>
                        }
                    >
                        {!finished && (<>
                        <Box
                            role="progressbar"
                            aria-label="תפוסה"
                            aria-valuenow={Math.round(pct)}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            sx={{ mt: 0.75, height: 8, borderRadius: 999, bgcolor: "action.hover", overflow: "hidden" }}
                        >
                            <Box
                                sx={{
                                    height: "100%",
                                    width: `${Math.max(pct, 4)}%`,
                                    borderRadius: 999,
                                    background: isFull
                                        ? "#ef4444"
                                        : almostFull
                                          ? "linear-gradient(90deg, #f59e0b, #fbbf24)"
                                          : `linear-gradient(90deg, ${theme.base}, ${theme.glow})`,
                                    transition: "width 400ms cubic-bezier(0.16, 1, 0.3, 1)",
                                }}
                            />
                        </Box>
                        <Typography
                            variant="caption"
                            fontWeight={700}
                            component="div"
                            noWrap
                            sx={{ mt: 0.5, color: isFull ? "error.main" : almostFull ? "warning.main" : "text.secondary" }}
                        >
                            {isFull ? "המשחק מלא" : spotsLeft === 1 ? "מקום אחרון!" : (
                                <>
                                    נשארו {spotsLeft}
                                    <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}> מקומות</Box>
                                </>
                            )}
                        </Typography>
                        </>)}
                    </StatTile>
                    <StatTile
                        accent={theme.base}
                        icon={<PaymentsRoundedIcon />}
                        label="מחיר"
                        value={isFree ? "חינם" : `₪${price}`}
                        caption={isFree ? "ללא עלות" : "תשלום במגרש"}
                    />
                </Box>

                {children && (
                    <Box
                        sx={{
                            display: "flex",
                            justifyContent: "flex-end",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: 1,
                            "& > *": { flex: { xs: "1 1 100%", sm: "0 0 auto" } },
                            // The action buttons (join / request / leave) are the page's main CTA:
                            // full width and touch-sized on phones, a solid pill at the end on desktop.
                            "& > * .MuiBox-root": { alignItems: { xs: "stretch", sm: "flex-end" } },
                            "& .MuiButton-root": {
                                minHeight: { xs: 48, sm: 44 },
                                px: 3,
                                fontSize: { xs: "1rem", sm: "0.95rem" },
                                fontWeight: 800,
                                borderRadius: 999,
                            },
                            "& > * > .MuiButton-root, & > * > .MuiBox-root > .MuiButton-root": { width: { xs: "100%", sm: "auto" } },
                        }}
                    >
                        {children}
                    </Box>
                )}
            </Box>
        </Card>
    );
}
