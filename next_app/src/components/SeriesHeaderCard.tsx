"use client";

import React from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import GroupsIcon from "@mui/icons-material/Groups";
import GroupIcon from "@mui/icons-material/Group";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import CardMedia from "@mui/material/CardMedia";
import { SPORT_IMAGES, SportType } from "@/utils/sports";

const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

const chipOverlaySx = {
  height: 24,
  maxWidth: "100%",
  fontSize: "0.72rem",
  fontWeight: 700,
  "& .MuiChip-label": {
    overflow: "hidden",
    textOverflow: "ellipsis",
    px: 1,
  },
  "& .MuiChip-icon": {
    marginInlineStart: "6px",
    marginInlineEnd: "-2px",
  },
} as const;

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
    const dayName = typeof dayOfWeek === "number" ? DAYS[dayOfWeek] : "שבועי";
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
                isolation: "isolate",
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
            <Box sx={{ position: "relative", overflow: "hidden", flexShrink: 0 }}>
                <CardMedia
                    component="img"
                    height="132"
                    image={imageSrc}
                    alt={name}
                    sx={{ objectPosition: "center 30%", display: "block", width: "100%" }}
                />
                <Box
                    sx={{
                        position: "absolute",
                        inset: 0,
                        background: "linear-gradient(180deg, rgba(2,6,23,0.2) 0%, transparent 40%, rgba(2,6,23,0.6) 100%)",
                        pointerEvents: "none",
                    }}
                />

                <Box
                    sx={{
                        position: "absolute",
                        inset: 0,
                        p: 2,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        minWidth: 0,
                        pointerEvents: "none",
                        "& > *": { pointerEvents: "auto", minWidth: 0 },
                    }}
                >
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1} sx={{ minWidth: 0 }}>
                        <Chip
                            size="small"
                            icon={<GroupsIcon sx={{ fontSize: "14px !important", color: "#fff !important" }} />}
                            label="קבוצה שבועית"
                            sx={{
                                ...chipOverlaySx,
                                maxWidth: isSubscribed ? "58%" : "100%",
                                color: "#fff",
                                bgcolor: "rgba(79,70,229,0.85)",
                                backdropFilter: "blur(6px)",
                            }}
                        />
                        {isSubscribed && (
                            <Chip
                                size="small"
                                icon={<CheckCircleRoundedIcon sx={{ fontSize: "15px !important", color: "#fff !important" }} />}
                                label="חבר"
                                sx={{
                                    ...chipOverlaySx,
                                    flexShrink: 0,
                                    color: "#fff",
                                    bgcolor: "rgba(5,150,105,0.92)",
                                }}
                            />
                        )}
                    </Stack>

                    <Stack
                        direction="row"
                        spacing={0.5}
                        alignItems="center"
                        sx={{
                            alignSelf: "flex-start",
                            maxWidth: "100%",
                            minWidth: 0,
                            color: "#fff",
                            px: 1,
                            py: 0.4,
                            borderRadius: 999,
                            bgcolor: "rgba(2,6,23,0.55)",
                            backdropFilter: "blur(6px)",
                        }}
                    >
                        <CalendarMonthIcon sx={{ fontSize: 14, flexShrink: 0 }} />
                        <Typography variant="caption" fontWeight={700} noWrap>
                            כל יום {dayName} • {time}
                        </Typography>
                    </Stack>
                </Box>
            </Box>

            <CardContent
                sx={{
                    p: 2,
                    pt: 1.75,
                    flexGrow: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: 1,
                    minWidth: 0,
                    "&:last-child": { pb: 2 },
                }}
            >
                <Box sx={{ minWidth: 0 }}>
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
                            wordBreak: "break-word",
                        }}
                    >
                        {name}
                    </Typography>

                    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5, color: "text.secondary", minWidth: 0 }}>
                        <PlaceOutlinedIcon sx={{ fontSize: 15, flexShrink: 0 }} />
                        <Typography variant="body2" sx={{ fontSize: "0.82rem" }} noWrap>
                            {fieldName}
                        </Typography>
                    </Stack>
                </Box>

                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: "auto", color: "text.secondary" }}>
                    <GroupIcon sx={{ fontSize: 15 }} />
                    <Typography variant="caption" fontWeight={700}>
                        {subscriberCount} חברי קבוצה
                    </Typography>
                </Stack>

                {children && (
                    <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        flexWrap="wrap"
                        useFlexGap
                        sx={{ pt: 1, borderTop: "1px solid", borderColor: "divider", minWidth: 0 }}
                    >
                        {children}
                    </Stack>
                )}
            </CardContent>
        </Card>
    );
}
