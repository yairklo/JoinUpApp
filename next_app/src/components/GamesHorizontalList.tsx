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
  isOnColoredBackground = false, // New prop to handle dark backgrounds
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
    <Box sx={{ mb: 4 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} px={1}>
        <Box display="flex" alignItems="center" gap={1}>
          {/* Accent bar */}
          <Box
            sx={{
              width: 4,
              height: 22,
              borderRadius: 999,
              bgcolor: isOnColoredBackground ? "common.white" : "primary.main",
              flexShrink: 0,
            }}
          />
          <Typography
            variant="h5"
            fontWeight="800"
            sx={{
              fontSize: { xs: "1.2rem", sm: "1.4rem" },
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
              fontWeight: 600,
              color: isOnColoredBackground ? "rgba(255,255,255,0.9)" : "text.secondary",
              "&:hover": {
                color: isOnColoredBackground ? "common.white" : "primary.main",
                bgcolor: isOnColoredBackground ? "rgba(255,255,255,0.1)" : "action.hover",
              },
            }}
          >
            הצג הכל
          </Button>
        )}
      </Box>

      <Stack
        direction="row"
        spacing={2}
        sx={{
          overflowX: "auto",
          pb: 2,
          px: 1,
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
          scrollSnapType: "x mandatory",
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
