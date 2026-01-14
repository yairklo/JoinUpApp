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
import PeopleIcon from "@mui/icons-material/People";

import CardMedia from "@mui/material/CardMedia";
import { SPORT_IMAGES, SportType } from "@/utils/sports";

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
  children,
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
  children?: React.ReactNode;
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

  // Resolve image
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
        height: 360,
        display: "flex",
        flexDirection: "column",
        borderRadius: 4,
        overflow: "hidden",
        transition: "transform 0.2s, box-shadow 0.2s",
        "&:hover": {
          transform: "translateY(-4px)",
          boxShadow: 8,
          "& .reveal-media": {
            height: 140,
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
        alt={title}
        sx={{
          filter: "brightness(0.9)",
          transition: "height 0.3s ease",
          objectPosition: "center top"
        }}
      />
      <CardContent sx={{ p: 2.5, flexGrow: 1, display: "flex", flexDirection: "column" }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5}>
          <Stack
            direction="row"
            spacing={0.5}
            alignItems="center"
            sx={{
              color: "text.secondary",
              bgcolor: "action.hover",
              px: 1,
              py: 0.5,
              borderRadius: 1.5,
            }}
          >
            <AccessTimeIcon sx={{ fontSize: 16 }} />
            <Typography variant="caption" fontWeight="bold">
              {date ? `${date} • ` : ""}{time} – {end}
            </Typography>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center">
            {teamSize && (
              <Chip
                label={`${teamSize}X${teamSize}`}
                size="small"
                variant="outlined"
                sx={{ fontWeight: "bold", height: 24, fontSize: "0.75rem", bgcolor: "background.paper" }}
              />
            )}
            <Chip
              icon={<PeopleIcon sx={{ fontSize: "16px !important" }} />}
              label={`${currentPlayers}/${maxPlayers}`}
              size="small"
              color={isFull ? "error" : "default"}
              variant={isFull ? "filled" : "outlined"}
              sx={{ fontWeight: "bold", height: 24, fontSize: "0.75rem" }}
            />
          </Stack>
        </Box>

        <Box sx={{ mb: 1, flexGrow: 1 }}>
          <Typography
            variant="h6"
            component="h3"
            fontWeight="bold"
            sx={{
              lineHeight: 1.2,
              fontSize: "1.1rem",
              display: "-webkit-box",
              overflow: "hidden",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 2,
            }}
          >
            {title || "משחק ללא שם"}
          </Typography>
          {subtitle && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                mt: 0.5,
                fontSize: "0.85rem",
                display: "-webkit-box",
                overflow: "hidden",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: 1,
              }}
            >
              {subtitle}
            </Typography>
          )}
        </Box>

        <Box
          className="reveal-content"
          sx={{
            maxHeight: 0,
            opacity: 0,
            overflow: "hidden",
            transition: "all 0.4s ease",
            mt: 0 // animate margin too
          }}
        >
          <Box sx={{ mt: "auto", mb: 2 }}>
            <Box display="flex" justifyContent="space-between" mb={0.5}>
              <Typography variant="caption" color="text.secondary" fontSize={10}>
                תפוסה
              </Typography>
              <Typography
                variant="caption"
                color={isFull ? "error.main" : "text.secondary"}
                fontSize={10}
              >
                {isFull ? "מלא" : `נשארו ${maxPlayers - currentPlayers} מקומות`}
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={occupancyPercentage}
              color={isFull ? "error" : "primary"}
              sx={{ height: 6, borderRadius: 4 }}
            />
          </Box>

          <Stack direction="row" spacing={1} mt={0}>
            {children}
          </Stack>
        </Box>
      </CardContent>
    </Card >
  );
}