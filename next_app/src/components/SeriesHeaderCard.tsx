"use client";

import React from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import LoopIcon from "@mui/icons-material/Loop";
import GroupIcon from "@mui/icons-material/Group";
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
}: {
    name: string;
    fieldName: string;
    time: string;
    dayOfWeek?: number | null;
    subscriberCount: number;
    sport?: string;
    children?: React.ReactNode;
}) {
    const dayName = typeof dayOfWeek === 'number' ? DAYS[dayOfWeek] : 'שבועי';
    const imageSrc = (sport && SPORT_IMAGES[sport as SportType])
        ? SPORT_IMAGES[sport as SportType]
        : SPORT_IMAGES.SOCCER;

    return (
        <Card
            elevation={3}
            sx={{
                minWidth: { xs: 280, sm: 300 },
                maxWidth: { xs: 280, sm: 320 },
                flexShrink: 0,
                height: 380,
                display: "flex",
                flexDirection: "column",
                borderRadius: 4,
                overflow: "hidden",
                transition: "transform 0.2s, box-shadow 0.2s",
                border: "1px solid",
                borderColor: "primary.light",
                bgcolor: "rgba(255, 255, 255, 0.95)",
                "&:hover": {
                    transform: "translateY(-4px)",
                    boxShadow: 8,
                    "& .reveal-media": {
                        height: 120,
                    },
                    "& .reveal-content": {
                        maxHeight: 200,
                        opacity: 1,
                        mt: 2
                    }
                },
            }}
        >
            <CardMedia
                className="reveal-media"
                component="img"
                height="220"
                image={imageSrc}
                alt={name}
                sx={{
                    filter: "brightness(0.9)",
                    transition: "height 0.3s ease",
                    objectPosition: "center top"
                }}
            />
            <CardContent sx={{ p: 2, flexGrow: 1, display: "flex", flexDirection: "column" }}>
                {/* Top Badge Row */}
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5}>
                    <Chip
                        icon={<LoopIcon sx={{ fontSize: "16px !important" }} />}
                        label="סדרה"
                        size="small"
                        color="secondary"
                        variant="filled"
                        sx={{ fontWeight: "bold", height: 24, fontSize: "0.75rem" }}
                    />

                    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: "text.secondary" }}>
                        <GroupIcon sx={{ fontSize: 16 }} />
                        <Typography variant="caption" fontWeight="bold">
                            {subscriberCount} קבועים
                        </Typography>
                    </Stack>
                </Box>

                {/* Title & Field */}
                <Typography
                    variant="h6"
                    component="h3"
                    fontWeight="bold"
                    sx={{
                        mb: 0.5,
                        lineHeight: 1.2,
                        fontSize: "1.1rem",
                        minHeight: "2.4em",
                        display: "-webkit-box",
                        overflow: "hidden",
                        WebkitBoxOrient: "vertical",
                        WebkitLineClamp: 2,
                        color: "primary.dark",
                    }}
                >
                    {name}
                </Typography>

                <Typography variant="body2" color="text.secondary" gutterBottom>
                    {fieldName}
                </Typography>

                {/* Bottom Info */}
                {/* Bottom Info & Actions - REVEAL ON HOVER */}
                <Box
                    className="reveal-content"
                    sx={{
                        maxHeight: 0,
                        opacity: 0,
                        overflow: "hidden",
                        transition: "all 0.4s ease",
                        mt: 0
                    }}
                >
                    <Box sx={{ mt: "auto", mb: 2 }}>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ bgcolor: "action.hover", p: 1, borderRadius: 2 }}>
                            <CalendarMonthIcon color="action" fontSize="small" />
                            <Typography variant="body2" fontWeight="500">
                                {dayName} בשעה {time}
                            </Typography>
                        </Stack>
                    </Box>

                    <Stack direction="row" spacing={1} mt={0}>
                        {children}
                    </Stack>
                </Box>
            </CardContent>
        </Card>
    );
}
