"use client";

import React from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import LinearProgress from "@mui/material/LinearProgress";
import Chip from "@mui/material/Chip";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import PeopleAltRoundedIcon from "@mui/icons-material/PeopleAltRounded";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";

import CardMedia from "@mui/material/CardMedia";
import { SPORT_IMAGES, SPORT_MAPPING, SPORT_EMOJI, SportType } from "@/utils/sports";

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

export default function GameHeaderCard({
  time,
  date,
  title,
  subtitle,
  currentPlayers,
  maxPlayers,
  durationHours,
  sport,
  teamSize,
  price,
  children,
  isJoined,
  fullWidth = false,
}: {
  time: string;
  date?: string;
  title: string;
  subtitle?: string;
  currentPlayers: number;
  maxPlayers: number;
  durationHours?: number;
  sport?: string;
  teamSize?: number | null;
  price?: number | null;
  children?: React.ReactNode;
  isJoined?: boolean;
  fullWidth?: boolean;
}) {
  function formatEndTime(startTime: string, hours: number | undefined): string {
    const dur = typeof hours === "number" && Number.isFinite(hours) ? hours : 1;
    const [h, m] = startTime.split(":").map((n) => parseInt(n, 10));
    const base = new Date(1970, 0, 1, isNaN(h) ? 0 : h, isNaN(m) ? 0 : m, 0, 0);
    base.setHours(base.getHours() + dur);
    const hh = String(base.getHours()).padStart(2, "0");
    const mm = String(base.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  const end = formatEndTime(time, durationHours);
  const occupancyPercentage = Math.min((currentPlayers / maxPlayers) * 100, 100);
  const isFull = currentPlayers >= maxPlayers;
  const spotsLeft = Math.max(0, maxPlayers - currentPlayers);
  const almostFull = !isFull && spotsLeft <= 2;

  const imageSrc = (sport && SPORT_IMAGES[sport as SportType])
    ? SPORT_IMAGES[sport as SportType]
    : SPORT_IMAGES.SOCCER;
  const sportLabel = sport ? SPORT_MAPPING[sport] : undefined;
  const sportEmoji = sport ? SPORT_EMOJI[sport] : undefined;

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
        borderColor: isJoined ? "success.light" : "divider",
        boxShadow: isJoined
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
      {/* Image + overlays constrained inside padded flex layer (no absolute edge bleed) */}
      <Box sx={{ position: "relative", overflow: "hidden", flexShrink: 0 }}>
        <CardMedia
          component="img"
          height={fullWidth ? 148 : 132}
          image={imageSrc}
          alt={title}
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
          {/* Top row */}
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1} sx={{ minWidth: 0 }}>
            {sportLabel ? (
              <Chip
                size="small"
                label={sportEmoji ? `${sportEmoji} ${sportLabel}` : sportLabel}
                sx={{
                  ...chipOverlaySx,
                  maxWidth: isJoined ? "58%" : "100%",
                  color: "#fff",
                  bgcolor: "rgba(2,6,23,0.55)",
                  backdropFilter: "blur(6px)",
                }}
              />
            ) : (
              <Box />
            )}
            {isJoined && (
              <Chip
                size="small"
                icon={<CheckCircleRoundedIcon sx={{ fontSize: "15px !important", color: "#fff !important" }} />}
                label="רשום"
                sx={{
                  ...chipOverlaySx,
                  flexShrink: 0,
                  color: "#fff",
                  bgcolor: "rgba(5,150,105,0.92)",
                }}
              />
            )}
          </Stack>

          {/* Bottom row */}
          <Stack direction="row" justifyContent="space-between" alignItems="flex-end" spacing={1} sx={{ minWidth: 0 }}>
            <Stack
              direction="row"
              spacing={0.5}
              alignItems="center"
              sx={{
                minWidth: 0,
                color: "#fff",
                px: 1,
                py: 0.4,
                borderRadius: 999,
                bgcolor: "rgba(2,6,23,0.55)",
                backdropFilter: "blur(6px)",
              }}
            >
              <AccessTimeIcon sx={{ fontSize: 14, flexShrink: 0 }} />
              <Typography
                variant="caption"
                fontWeight={700}
                noWrap
                sx={{ direction: "ltr", unicodeBidi: "isolate" }}
              >
                {time}–{end}{date ? ` • ${date}` : ""}
              </Typography>
            </Stack>

            {typeof price === "number" && price > 0 && (
              <Chip
                size="small"
                label={`₪${price}`}
                sx={{
                  ...chipOverlaySx,
                  flexShrink: 0,
                  color: "#022c22",
                  bgcolor: "rgba(167,243,208,0.95)",
                }}
              />
            )}
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
            {title || "משחק ללא שם"}
          </Typography>
          {subtitle && (
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5, color: "text.secondary", minWidth: 0 }}>
              <PlaceOutlinedIcon sx={{ fontSize: 15, flexShrink: 0 }} />
              <Typography
                variant="body2"
                sx={{
                  fontSize: "0.82rem",
                  display: "-webkit-box",
                  overflow: "hidden",
                  WebkitBoxOrient: "vertical",
                  WebkitLineClamp: 1,
                  wordBreak: "break-word",
                }}
              >
                {subtitle}
              </Typography>
            </Stack>
          )}
        </Box>

        <Box sx={{ mt: "auto", minWidth: 0 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" gap={1} mb={0.5} sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: "text.secondary", minWidth: 0 }}>
              <PeopleAltRoundedIcon sx={{ fontSize: 15, flexShrink: 0 }} />
              <Typography variant="caption" fontWeight={700} noWrap>
                {currentPlayers}/{maxPlayers}
                {teamSize ? ` • ${teamSize}X${teamSize}` : ""}
              </Typography>
            </Stack>
            <Typography
              variant="caption"
              fontWeight={600}
              noWrap
              color={isFull ? "error.main" : almostFull ? "warning.main" : "text.secondary"}
            >
              {isFull ? "מלא" : `נשארו ${spotsLeft} מקומות`}
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={occupancyPercentage}
            color={isFull ? "error" : almostFull ? "warning" : "primary"}
            sx={{ height: 6, borderRadius: 999, bgcolor: "action.hover" }}
          />
        </Box>

        {children && (
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            justifyContent="space-between"
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
