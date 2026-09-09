"use client";

import React, { useRef } from "react";
import Link from "next/link";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { Reveal } from "@/components/motion/Reveal";

export default function GamesHorizontalList({
  title,
  children,
  isOnColoredBackground = false,
  onSeeAll,
  seeAllHref,
  customHeaderAction,
  isRefreshing = false,
}: {
  title: string;
  children: React.ReactNode;
  isOnColoredBackground?: boolean;
  onSeeAll?: () => void;
  seeAllHref?: string;
  customHeaderAction?: React.ReactNode;
  isRefreshing?: boolean;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const childCount = React.Children.count(children);
  const showArrows = childCount > 1;

  const scrollByCard = (direction: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const amount = Math.min(320, el.clientWidth * 0.75);
    // In RTL, "next" (toward later cards / visual left) requires a negative scroll delta.
    // "Previous" (toward earlier cards / visual right) requires a positive scroll delta.
    el.scrollBy({ left: -direction * amount, behavior: "smooth" });
  };

  const seeAllButtonSx = {
    flexShrink: 0,
    fontWeight: 600,
    fontSize: { xs: "0.8rem", sm: "0.875rem" },
    color: isOnColoredBackground ? "rgba(255,255,255,0.9)" : "text.secondary",
    "&:hover": {
      color: isOnColoredBackground ? "common.white" : "primary.main",
      bgcolor: isOnColoredBackground ? "rgba(255,255,255,0.1)" : "action.hover",
    },
  } as const;

  return (
    <Box sx={{ mb: { xs: 3, md: 4 }, mx: { xs: -2, sm: 0 }, position: "relative" }}>
      {isRefreshing && (
        <LinearProgress
          sx={{
            position: "absolute",
            top: 0,
            insetInlineStart: 0,
            insetInlineEnd: 0,
            height: 2,
            borderRadius: 1,
            bgcolor: "transparent",
          }}
        />
      )}
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={1.5}
        px={{ xs: 2, sm: 1 }}
        gap={1}
      >
        <Box display="flex" alignItems="center" gap={1} minWidth={0}>
          <Box
            sx={{
              width: 4,
              height: 20,
              borderRadius: 999,
              bgcolor: isOnColoredBackground ? "common.white" : "primary.main",
              flexShrink: 0,
            }}
          />
          <Typography
            variant="h5"
            fontWeight="800"
            noWrap
            sx={{
              fontSize: { xs: "1.1rem", sm: "1.35rem" },
              letterSpacing: "-0.02em",
              color: isOnColoredBackground ? "common.white" : "text.primary",
              textShadow: isOnColoredBackground ? "0 2px 4px rgba(0,0,0,0.1)" : "none",
            }}
          >
            {title}
          </Typography>
          {customHeaderAction}
        </Box>

        <Box display="flex" alignItems="center" gap={0.5} flexShrink={0}>
          {showArrows && (
            <Box sx={{ display: { xs: "none", md: "flex" }, gap: 0.5 }}>
              <IconButton
                size="small"
                aria-label="הקודם"
                onClick={() => scrollByCard(-1)}
                sx={{
                  border: 1,
                  borderColor: "divider",
                  color: isOnColoredBackground ? "common.white" : "text.secondary",
                }}
              >
                <ChevronRightIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                aria-label="הבא"
                onClick={() => scrollByCard(1)}
                sx={{
                  border: 1,
                  borderColor: "divider",
                  color: isOnColoredBackground ? "common.white" : "text.secondary",
                }}
              >
                <ChevronLeftIcon fontSize="small" />
              </IconButton>
            </Box>
          )}
          {seeAllHref ? (
            <Button size="small" component={Link} href={seeAllHref} endIcon={<ArrowBackIcon fontSize="small" />} sx={seeAllButtonSx}>
              הכל
            </Button>
          ) : onSeeAll ? (
            <Button size="small" onClick={onSeeAll} endIcon={<ArrowBackIcon fontSize="small" />} sx={seeAllButtonSx}>
              הכל
            </Button>
          ) : null}
        </Box>
      </Box>

      <Reveal>
        <Box sx={{ position: "relative" }}>
          <Stack
            ref={scrollerRef}
            direction="row"
            spacing={1.5}
            className="carousel-edge"
            sx={{
              overflowX: "auto",
              pb: 1.5,
              px: { xs: 2, sm: 1 },
              paddingInlineEnd: { xs: 6, sm: 5 },
              // A single card centered in a full-width rail on desktop reads as a rendering
              // glitch (floating alone in a sea of whitespace) rather than "here's one result" --
              // keep it aligned with the rail's start like every other card count instead.
              justifyContent: "flex-start",
              scrollbarWidth: "none",
              "&::-webkit-scrollbar": { display: "none" },
              scrollSnapType: "x mandatory",
              scrollPaddingInline: { xs: 16, sm: 8 },
              WebkitOverflowScrolling: "touch",
              "& > *": {
                scrollSnapAlign: "start",
              },
            }}
          >
            {children}
          </Stack>
          {showArrows && (
            <Box
              sx={{
                display: { xs: "block", md: "none" },
                pointerEvents: "none",
                position: "absolute",
                insetBlock: 0,
                insetInlineEnd: 0,
                width: 40,
                background: "linear-gradient(to right, var(--mui-palette-background-default, #fff) 0%, transparent 100%)",
              }}
            />
          )}
        </Box>
      </Reveal>
    </Box>
  );
}
