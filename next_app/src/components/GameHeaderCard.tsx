"use client";

import React from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";

import { SPORT_MAPPING, SPORT_EMOJI, getSportTheme } from "@/utils/sports";
import SportCover from "@/components/ui/SportCover";
import { MotionCard, cardHoverProps } from "@/components/motion/MotionCard";
import { formatHebrewDateRelative } from "@/utils/hebrewDate";

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

const glassChipSx = {
  color: "#fff",
  bgcolor: "rgba(255,255,255,0.14)",
  border: "1px solid rgba(255,255,255,0.22)",
  backdropFilter: "blur(8px)",
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
  isFriendsOnly,
  fullWidth = false,
  href,
  fieldHref,
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
  /** When explicitly `false` (server confirmed the game is public), shows a "פתוח לכולם" badge. Leave undefined to hide the badge (e.g. payloads that don't carry this field yet). */
  isFriendsOnly?: boolean;
  fullWidth?: boolean;
  /** When set, the whole card navigates here on click (footer actions stop propagation so they don't also navigate). */
  href?: string;
  /** When set, the subtitle (field name/location) becomes its own link to the field's profile page. */
  fieldHref?: string;
}) {
  const router = useRouter();
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

  const theme = getSportTheme(sport);
  const sportLabel = sport ? SPORT_MAPPING[sport] : undefined;
  const sportEmoji = sport ? SPORT_EMOJI[sport] : undefined;

  return (
    <MotionCard
      {...cardHoverProps}
      elevation={0}
      dir="rtl"
      onClick={href ? () => router.push(href) : undefined}
      onKeyDown={
        href
          ? (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                router.push(href);
              }
            }
          : undefined
      }
      role={href ? "link" : undefined}
      tabIndex={href ? 0 : undefined}
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
        borderColor: isJoined ? "rgba(16,185,129,0.4)" : "rgba(148,163,184,0.16)",
        boxShadow: isJoined
          ? "inset 0 1px 0 0 rgba(255,255,255,0.06), 0 0 0 2px rgba(16,185,129,0.25), 0 4px 14px rgba(15,23,42,0.06)"
          : "inset 0 1px 0 0 rgba(255,255,255,0.06), 0 1px 3px rgba(15,23,42,0.06)",
        transition: "box-shadow 0.2s ease, border-color 0.2s ease",
        WebkitTapHighlightColor: "transparent",
        cursor: href ? "pointer" : undefined,
        "@media (hover: hover)": {
          "&:hover": {
            borderColor: isJoined ? "rgba(16,185,129,0.5)" : "rgba(5,150,105,0.3)",
            boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.08), 0 18px 36px -8px rgba(5,150,105,0.28), 0 4px 12px rgba(15,23,42,0.08)",
          },
        },
      }}
    >
      <SportCover sport={sport} height={fullWidth ? 156 : 128}>
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            p: 1.75,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            minWidth: 0,
            color: "#fff",
          }}
        >
          {/* Top row: sport identity + status badges */}
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1} sx={{ minWidth: 0 }}>
            {sportLabel ? (
              <Chip
                size="small"
                label={sportEmoji ? `${sportEmoji} ${sportLabel}` : sportLabel}
                sx={{ ...chipOverlaySx, ...glassChipSx, maxWidth: isJoined ? "58%" : "100%" }}
              />
            ) : (
              <Box />
            )}
            <Stack direction="row" spacing={0.75} sx={{ flexShrink: 0 }}>
              {isFriendsOnly === false && !isJoined && (
                <Chip size="small" label="פתוח לכולם" sx={{ ...chipOverlaySx, ...glassChipSx }} />
              )}
              {isJoined && (
                <Chip
                  size="small"
                  icon={<CheckCircleRoundedIcon sx={{ fontSize: "15px !important", color: `${theme.deep} !important` }} />}
                  label="רשום"
                  sx={{ ...chipOverlaySx, color: theme.ink, bgcolor: "#fff" }}
                />
              )}
            </Stack>
          </Stack>

          {/* Bottom row: start time is the hero of a game card */}
          <Stack direction="row" justifyContent="space-between" alignItems="flex-end" spacing={1} sx={{ minWidth: 0 }}>
            <Box sx={{ minWidth: 0 }}>
              {date && (
                <Typography
                  suppressHydrationWarning
                  noWrap
                  sx={{ fontSize: "0.78rem", fontWeight: 700, opacity: 0.85, lineHeight: 1.2, mb: 0.25 }}
                >
                  {formatHebrewDateRelative(date)}
                </Typography>
              )}
              <Typography
                component="p"
                dir="ltr"
                noWrap
                sx={{
                  unicodeBidi: "isolate",
                  fontWeight: 800,
                  lineHeight: 1,
                  letterSpacing: "-0.02em",
                  fontVariantNumeric: "tabular-nums",
                  fontSize: fullWidth ? "2.1rem" : "1.75rem",
                  textShadow: "0 2px 12px rgba(0,0,0,0.25)",
                }}
              >
                {time}
                <Box component="span" sx={{ fontSize: "0.5em", fontWeight: 600, opacity: 0.7, ml: 0.5 }}>
                  –{end}
                </Box>
              </Typography>
            </Box>

            {typeof price === "number" && price > 0 && (
              <Chip
                size="small"
                label={`₪${price} במגרש`}
                sx={{ ...chipOverlaySx, flexShrink: 0, color: theme.ink, bgcolor: theme.glow }}
              />
            )}
          </Stack>
        </Box>
      </SportCover>

      <CardContent
        sx={{
          p: 2,
          pt: 1.75,
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
          minWidth: 0,
          "&:last-child": { pb: 2 },
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="h6"
            component="h3"
            fontWeight={800}
            sx={{
              lineHeight: 1.25,
              fontSize: "1.05rem",
              letterSpacing: "-0.01em",
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
            <Stack
              direction="row"
              spacing={0.5}
              alignItems="center"
              component={fieldHref ? NextLink : "div"}
              href={fieldHref}
              onClick={fieldHref ? (e: React.MouseEvent) => e.stopPropagation() : undefined}
              sx={{
                mt: 0.5,
                minWidth: 0,
                width: "fit-content",
                maxWidth: "100%",
                color: fieldHref ? "primary.main" : "text.secondary",
                textDecoration: "none",
                ...(fieldHref && {
                  "&:hover": { textDecoration: "underline" },
                }),
              }}
            >
              <PlaceOutlinedIcon sx={{ fontSize: 15, flexShrink: 0 }} />
              <Typography
                variant="body2"
                sx={{
                  fontSize: "0.82rem",
                  fontWeight: fieldHref ? 700 : 500,
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
          <Box display="flex" justifyContent="space-between" alignItems="baseline" gap={1} mb={0.75} sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={0.75} alignItems="baseline" sx={{ minWidth: 0 }}>
              <Typography
                component="span"
                sx={{ fontWeight: 800, fontSize: "0.95rem", fontVariantNumeric: "tabular-nums", color: "text.primary" }}
              >
                {currentPlayers}
                <Box component="span" sx={{ color: "text.secondary", fontWeight: 600 }}>/{maxPlayers}</Box>
              </Typography>
              <Typography component="span" variant="caption" color="text.secondary" fontWeight={600} noWrap>
                שחקנים{teamSize ? ` · ${teamSize}X${teamSize}` : ""}
              </Typography>
            </Stack>
            <Typography
              variant="caption"
              fontWeight={700}
              noWrap
              color={isFull ? "error.main" : almostFull ? "warning.main" : "text.secondary"}
            >
              {isFull ? "מלא" : spotsLeft === 1 ? "מקום אחרון!" : `נשארו ${spotsLeft}`}
            </Typography>
          </Box>
          <Box
            role="progressbar"
            aria-label="תפוסה"
            aria-valuenow={Math.round(occupancyPercentage)}
            aria-valuemin={0}
            aria-valuemax={100}
            sx={{ height: 6, borderRadius: 999, bgcolor: "action.hover", overflow: "hidden" }}
          >
            <Box
              sx={{
                height: "100%",
                width: `${Math.max(occupancyPercentage, 4)}%`,
                borderRadius: 999,
                bgcolor: isFull ? "error.main" : almostFull ? "warning.main" : theme.base,
                transition: "width 400ms cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            />
          </Box>
        </Box>

        {children && (
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            justifyContent="space-between"
            flexWrap="wrap"
            useFlexGap
            onClick={(e) => e.stopPropagation()}
            sx={{ pt: 1, borderTop: "1px solid", borderColor: "divider", minWidth: 0 }}
          >
            {children}
          </Stack>
        )}
      </CardContent>
    </MotionCard>
  );
}
