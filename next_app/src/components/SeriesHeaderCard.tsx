"use client";

import React from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import LoopIcon from "@mui/icons-material/Loop";
import GroupIcon from "@mui/icons-material/Group";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import CardMedia from "@mui/material/CardMedia";
import { SPORT_IMAGES, SportType } from "@/utils/sports";

// Helper map for day of week if needed
const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export default function SeriesHeaderCard({
    name,
    fieldName,
    time,
    dayOfWeek,
    subscriberCount,

    sport,
    children,
    isSubscribed,
    fullWidth = false,
}: {
    name: string;
    fieldName: string;
    time: string;
    dayOfWeek?: number | null;
    subscriberCount: number;
    sport?: string;
    children?: React.ReactNode;
    isSubscribed?: boolean;
    fullWidth?: boolean;
}) {
    const dayName = typeof dayOfWeek === 'number' ? DAYS[dayOfWeek] : 'שבועי';
    const imageSrc = (sport && SPORT_IMAGES[sport as SportType])
        ? SPORT_IMAGES[sport as SportType]
        : SPORT_IMAGES.SOCCER;

    return (
        <Card
            elevation={0}
            dir="rtl"
            sx={{
                width: fullWidth ? "100%" : undefined,
                minWidth: fullWidth ? 0 : { xs: 252, sm: 300 },
                maxWidth: fullWidth ? "100%" : { xs: 268, sm: 320 },
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                borderRadius: { xs: 4, sm: 5 },
                overflow: "hidden",
                position: "relative",
                border: "1px solid",
                borderColor: isSubscribed ? "success.light" : "secondary.light",
                boxShadow: isSubscribed
                    ? "0 0 0 2px rgba(16,185,129,0.25), 0 4px 14px rgba(15,23,42,0.06)"
                    : "0 1px 3px rgba(15,23,42,0.06)",
                transition: "transform 0.2s ease, box-shadow 0.2s ease",
                WebkitTapHighlightColor: "transparent",
                "@media (hover: hover)": {
                    "&:hover": {
                        transform: "translateY(-4px)",
                        boxShadow: "0 14px 32px rgba(15,23,42,0.14)",
                    },
                },
            }}
        >
            {/* ── Image header ── */}
            <Box sx={{ position: "relative" }}>
                <CardMedia
                    component="img"
                    height="132"
                    image={imageSrc}
                    alt={name}
                    sx={{ objectPosition: "center 30%" }}
                />
                <Box
                    sx={{
                        position: "absolute",
                        inset: 0,
                        background: "linear-gradient(180deg, rgba(2,6,23,0.15) 0%, transparent 35%, rgba(2,6,23,0.55) 100%)",
                    }}
                />

                {/* Series tag */}
                <Chip
                    size="small"
                    icon={<LoopIcon sx={{ fontSize: "14px !important", color: "#fff !important" }} />}
                    label="סדרה שבועית"
                    sx={{
                        position: "absolute",
                        top: 10,
                        insetInlineStart: 10,
                        height: 24,
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        color: "#fff",
                        bgcolor: "rgba(79,70,229,0.85)",
                        backdropFilter: "blur(6px)",
                    }}
                />

                {isSubscribed && (
                    <Chip
                        size="small"
                        icon={<CheckCircleRoundedIcon sx={{ fontSize: "15px !important", color: "#fff !important" }} />}
                        label="מנוי"
                        sx={{
                            position: "absolute",
                            top: 10,
                            insetInlineEnd: 10,
                            height: 24,
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            color: "#fff",
                            bgcolor: "rgba(5,150,105,0.9)",
                        }}
                    />
                )}

                {/* Schedule pill on image */}
                <Stack
                    direction="row"
                    spacing={0.5}
                    alignItems="center"
                    sx={{
                        position: "absolute",
                        bottom: 10,
                        insetInlineStart: 10,
                        color: "#fff",
                        px: 1,
                        py: 0.4,
                        borderRadius: 999,
                        bgcolor: "rgba(2,6,23,0.55)",
                        backdropFilter: "blur(6px)",
                    }}
                >
                    <CalendarMonthIcon sx={{ fontSize: 14 }} />
                    <Typography variant="caption" fontWeight={700}>
                        כל יום {dayName} • {time}
                    </Typography>
                </Stack>
            </Box>

            {/* ── Content ── */}
            <CardContent
                sx={{
                    p: 2,
                    pt: 1.75,
                    flexGrow: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: 1,
                    "&:last-child": { pb: 2 },
                }}
            >
                <Box>
                    <Typography
                        variant="h6"
                        component="h3"
                        fontWeight={700}
                        sx={{
                            lineHeight: 1.25,
                            fontSize: "1.05rem",
                            display: "-webkit-box",
                            overflow: "hidden",
                            WebkitBoxOrient: "vertical",
                            WebkitLineClamp: 2,
                        }}
                    >
                        {name}
                    </Typography>

                    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5, color: "text.secondary" }}>
                        <PlaceOutlinedIcon sx={{ fontSize: 15, flexShrink: 0 }} />
                        <Typography variant="body2" sx={{ fontSize: "0.82rem" }} noWrap>
                            {fieldName}
                        </Typography>
                    </Stack>
                </Box>

                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: "auto", color: "text.secondary" }}>
                    <GroupIcon sx={{ fontSize: 15 }} />
                    <Typography variant="caption" fontWeight={700}>
                        {subscriberCount} שחקנים קבועים
                    </Typography>
                </Stack>

                {children && (
                    <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        sx={{ pt: 1, borderTop: "1px solid", borderColor: "divider" }}
                    >
                        {children}
                    </Stack>
                )}
            </CardContent>
        </Card>
    );
}
