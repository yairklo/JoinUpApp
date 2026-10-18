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

import SportCover from "@/components/ui/SportCover";
import { SPORT_MAPPING, SPORT_EMOJI, getSportTheme } from "@/utils/sports";
import { formatHebrewDateRelative } from "@/utils/hebrewDate";

function formatEndTime(startTime: string, hours: number | undefined): string {
    const dur = typeof hours === "number" && Number.isFinite(hours) ? hours : 1;
    const [h, m] = startTime.split(":").map((n) => parseInt(n, 10));
    const base = new Date(1970, 0, 1, isNaN(h) ? 0 : h, isNaN(m) ? 0 : m, 0, 0);
    base.setMinutes(base.getMinutes() + Math.round(dur * 60));
    return `${String(base.getHours()).padStart(2, "0")}:${String(base.getMinutes()).padStart(2, "0")}`;
}

const glassChipSx = {
    height: 26,
    fontSize: "0.75rem",
    fontWeight: 700,
    color: "#fff",
    bgcolor: "rgba(255,255,255,0.14)",
    border: "1px solid rgba(255,255,255,0.22)",
    backdropFilter: "blur(8px)",
} as const;

function Stat({
    icon,
    label,
    value,
    caption,
    children,
}: {
    icon: React.ReactNode;
    label: string;
    value: React.ReactNode;
    caption?: React.ReactNode;
    children?: React.ReactNode;
}) {
    return (
        <Box sx={{ minWidth: 0, px: { xs: 1.25, sm: 2.5 }, py: { xs: 1.75, sm: 2.25 } }}>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: "text.secondary", mb: 0.5 }}>
                <Box sx={{ display: "flex", "& svg": { fontSize: 16 } }}>{icon}</Box>
                <Typography variant="caption" fontWeight={700} noWrap>
                    {label}
                </Typography>
            </Stack>
            <Typography
                component="div"
                noWrap
                sx={{
                    fontWeight: 800,
                    fontSize: { xs: "1.05rem", sm: "1.3rem" },
                    lineHeight: 1.2,
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
 * Game page header: a full sport-art hero carrying the title and venue, a three-up stat strip
 * (when / players / price) and the viewer's actions. Replaces reusing the feed's list card
 * here, which buried the title under the photo and crammed page-level info into card chrome.
 */
export default function GameHero({
    time,
    date,
    durationHours,
    title,
    subtitle,
    fieldHref,
    currentPlayers,
    maxPlayers,
    sport,
    teamSize,
    price,
    children,
}: {
    time: string;
    date?: string;
    durationHours?: number;
    title: string;
    subtitle?: string;
    fieldHref?: string;
    currentPlayers: number;
    maxPlayers: number;
    sport?: string;
    teamSize?: number | null;
    price?: number | null;
    children?: React.ReactNode;
}) {
    const theme = getSportTheme(sport);
    const end = formatEndTime(time, durationHours);
    const pct = maxPlayers > 0 ? Math.min((currentPlayers / maxPlayers) * 100, 100) : 0;
    const isFull = currentPlayers >= maxPlayers;
    const spotsLeft = Math.max(0, maxPlayers - currentPlayers);
    const almostFull = !isFull && spotsLeft <= 2;
    const sportLabel = sport ? SPORT_MAPPING[sport] : undefined;
    const sportEmoji = sport ? SPORT_EMOJI[sport] : undefined;
    const isFree = !price || price <= 0;

    return (
        <Card
            elevation={0}
            dir="rtl"
            sx={{
                borderRadius: { xs: 5, md: 6 },
                overflow: "hidden",
                border: "1px solid",
                borderColor: "divider",
                boxShadow: "0 1px 3px rgba(15,23,42,0.06), 0 12px 32px -12px rgba(15,23,42,0.12)",
            }}
        >
            <SportCover sport={sport} height={{ xs: 196, md: 248 }} lineOpacity={0.2}>
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
                    }}
                >
                    <Stack direction="row" spacing={0.75}>
                        {sportLabel && (
                            <Chip size="small" label={sportEmoji ? `${sportEmoji} ${sportLabel}` : sportLabel} sx={glassChipSx} />
                        )}
                        {teamSize ? <Chip size="small" label={`${teamSize}X${teamSize}`} sx={glassChipSx} dir="ltr" /> : null}
                    </Stack>

                    <Box sx={{ minWidth: 0 }}>
                        <Typography
                            component="h1"
                            sx={{
                                fontWeight: 800,
                                fontSize: { xs: "1.6rem", sm: "2rem", md: "2.6rem" },
                                lineHeight: 1.1,
                                letterSpacing: "-0.025em",
                                textShadow: "0 2px 16px rgba(0,0,0,0.3)",
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
                                    color: "rgba(255,255,255,0.88)",
                                    textDecoration: "none",
                                    ...(fieldHref && { "&:hover": { color: "#fff", textDecoration: "underline" } }),
                                }}
                            >
                                <PlaceRoundedIcon sx={{ fontSize: 17, color: theme.glow, flexShrink: 0 }} />
                                <Typography noWrap sx={{ fontSize: { xs: "0.875rem", md: "1rem" }, fontWeight: 600 }}>
                                    {subtitle}
                                </Typography>
                            </Stack>
                        )}
                    </Box>
                </Box>
            </SportCover>

            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                    "& > * + *": { borderInlineStart: "1px solid", borderColor: "divider" },
                }}
            >
                <Stat
                    icon={<ScheduleRoundedIcon />}
                    label="מתי"
                    value={
                        <Box component="span" dir="ltr" sx={{ unicodeBidi: "isolate" }}>
                            {time}
                            <Box component="span" sx={{ color: "text.secondary", fontWeight: 600, fontSize: "0.75em" }}>
                                –{end}
                            </Box>
                        </Box>
                    }
                    caption={date ? <span suppressHydrationWarning>{formatHebrewDateRelative(date)}</span> : undefined}
                />
                <Stat
                    icon={<GroupsRoundedIcon />}
                    label="שחקנים"
                    value={
                        <>
                            {currentPlayers}
                            <Box component="span" sx={{ color: "text.secondary", fontWeight: 600 }}>/{maxPlayers}</Box>
                        </>
                    }
                >
                    <Box
                        role="progressbar"
                        aria-label="תפוסה"
                        aria-valuenow={Math.round(pct)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        sx={{ mt: 0.75, height: 5, borderRadius: 999, bgcolor: "action.hover", overflow: "hidden", maxWidth: 140 }}
                    >
                        <Box
                            sx={{
                                height: "100%",
                                width: `${Math.max(pct, 4)}%`,
                                borderRadius: 999,
                                bgcolor: isFull ? "error.main" : almostFull ? "warning.main" : theme.base,
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
                        {isFull ? "המשחק מלא" : spotsLeft === 1 ? "מקום אחרון!" : `נשארו ${spotsLeft} מקומות`}
                    </Typography>
                </Stat>
                <Stat
                    icon={<PaymentsRoundedIcon />}
                    label="מחיר"
                    value={isFree ? "חינם" : `₪${price}`}
                    caption={isFree ? "ללא עלות" : "תשלום במגרש"}
                />
            </Box>

            {children && (
                <Box
                    sx={(t) => ({
                        px: { xs: 2, md: 3 },
                        py: 1.5,
                        borderTop: "1px solid",
                        borderColor: "divider",
                        bgcolor: alpha(t.palette.text.primary, t.palette.mode === "dark" ? 0.03 : 0.015),
                        display: "flex",
                        justifyContent: "flex-end",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: 1,
                    })}
                >
                    {children}
                </Box>
            )}
        </Card>
    );
}
