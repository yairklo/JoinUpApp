"use client";

import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
// In RTL "forward" points left, so ArrowBack is the visually-correct glyph
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

export default function GamesHorizontalList({
  title,
  children,
  isOnColoredBackground = false,
  onSeeAll,
  customHeaderAction,
}: {
  title: string;
  children: React.ReactNode;
  isOnColoredBackground?: boolean;
  onSeeAll?: () => void;
  customHeaderAction?: React.ReactNode;
}) {
  return (
    <Box sx={{ mb: { xs: 3, md: 4 }, mx: { xs: -2, sm: 0 } }}>
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={1.5}
        px={{ xs: 2, sm: 1 }}
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
              color: isOnColoredBackground ? "common.white" : "text.primary",
              textShadow: isOnColoredBackground ? "0 2px 4px rgba(0,0,0,0.1)" : "none",
            }}
          >
            {title}
          </Typography>
          {customHeaderAction}
        </Box>

        {onSeeAll && (
          <Button
            size="small"
            onClick={onSeeAll}
            endIcon={<ArrowBackIcon fontSize="small" />}
            sx={{
              flexShrink: 0,
              fontWeight: 600,
              fontSize: { xs: "0.8rem", sm: "0.875rem" },
              color: isOnColoredBackground ? "rgba(255,255,255,0.9)" : "text.secondary",
              "&:hover": {
                color: isOnColoredBackground ? "common.white" : "primary.main",
                bgcolor: isOnColoredBackground ? "rgba(255,255,255,0.1)" : "action.hover",
              },
            }}
          >
            הכל
          </Button>
        )}
      </Box>

      <Stack
        direction="row"
        spacing={1.5}
        className="carousel-edge"
        sx={{
          overflowX: "auto",
          pb: 1.5,
          px: { xs: 2, sm: 1 },
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
    </Box>
  );
}
