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
}: {
  time: string;
  date?: string;
  title: string;
  subtitle?: string;
  currentPlayers: number;
  maxPlayers: number;
  durationHours?: number;
  sport?: string; // loosely typed string to match API, or strict SportType
  teamSize?: number | null;
  price?: number | null;
  children?: React.ReactNode;
  isJoined?: boolean;
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
        minWidth: { xs: 280, sm: 300 },
        maxWidth: { xs: 280, sm: 320 },
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        borderRadius: 5,
        overflow: "hidden",
        position: "relative",
        border: "1px solid",
        borderColor: isJoined ? "success.light" : "divider",
        boxShadow: isJoined
          ? "0 0 0 2px rgba(16,185,129,0.25), 0 4px 14px rgba(15,23,42,0.06)"
          : "0 1px 3px rgba(15,23,42,0.06)",
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
        "&:hover": {
          transform: "translateY(-4px)",
          boxShadow: "0 14px 32px rgba(15,23,42,0.14)",
        },
      }}
    >
      {/* ── Image header with overlays ── */}
      <Box sx={{ position: "relative" }}>
        <CardMedia
          component="img"
          height="132"
          image={imageSrc}
          alt={title}
          sx={{ objectPosition: "center 30%" }}
        />
        {/* Bottom scrim for legibility */}
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, rgba(2,6,23,0.15) 0%, transparent 35%, rgba(2,6,23,0.55) 100%)",
          }}
        />

        {/* Sport tag */}
        {sportLabel && (
          <Chip
            size="small"
            label={sportEmoji ? `${sportEmoji} ${sportLabel}` : sportLabel}
            sx={{
              position: "absolute",
              top: 10,
              insetInlineStart: 10,
              height: 24,
              fontSize: "0.75rem",
              fontWeight: 700,
              color: "#fff",
              bgcolor: "rgba(2,6,23,0.55)",
              backdropFilter: "blur(6px)",
            }}
          />
        )}

        {/* Joined badge */}
        {isJoined && (
          <Chip
            size="small"
            icon={<CheckCircleRoundedIcon sx={{ fontSize: "15px !important", color: "#fff !important" }} />}
            label="רשום"
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

        {/* Time pill – anchored to image bottom */}
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
          <AccessTimeIcon sx={{ fontSize: 14 }} />
          <Typography variant="caption" fontWeight={700} sx={{ direction: "ltr" }}>
            {time}–{end}{date ? ` • ${date}` : ""}
          </Typography>
        </Stack>

        {/* Price pill */}
        {typeof price === "number" && price > 0 && (
          <Chip
            size="small"
            label={`₪${price}`}
            sx={{
              position: "absolute",
              bottom: 10,
              insetInlineEnd: 10,
              height: 24,
              fontSize: "0.75rem",
              fontWeight: 800,
              color: "#022c22",
              bgcolor: "rgba(167,243,208,0.95)",
            }}
          />
        )}
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
            {title || "משחק ללא שם"}
          </Typography>
          {subtitle && (
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5, color: "text.secondary" }}>
              <PlaceOutlinedIcon sx={{ fontSize: 15, flexShrink: 0 }} />
              <Typography
                variant="body2"
                sx={{
                  fontSize: "0.82rem",
                  display: "-webkit-box",
                  overflow: "hidden",
                  WebkitBoxOrient: "vertical",
                  WebkitLineClamp: 1,
                }}
              >
                {subtitle}
              </Typography>
            </Stack>
          )}
        </Box>

        {/* Occupancy */}
        <Box sx={{ mt: "auto" }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.5}>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: "text.secondary" }}>
              <PeopleAltRoundedIcon sx={{ fontSize: 15 }} />
              <Typography variant="caption" fontWeight={700}>
                {currentPlayers}/{maxPlayers}
                {teamSize ? ` • ${teamSize}X${teamSize}` : ""}
              </Typography>
            </Stack>
            <Typography
              variant="caption"
              fontWeight={600}
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

        {/* Actions – always visible */}
        {children && (
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            justifyContent="space-between"
            sx={{ pt: 1, borderTop: "1px solid", borderColor: "divider" }}
          >
            {children}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
