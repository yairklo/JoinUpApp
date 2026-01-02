"use client";

import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import Button from "@mui/material/Button";

export default function GamesHorizontalList({
  title,
  children,
  isOnColoredBackground = false, // New prop to handle dark backgrounds
  onSeeAll,
}: {
  title: string;
  children: React.ReactNode;
  isOnColoredBackground?: boolean;
  onSeeAll?: () => void;
}) {
  return (
    <Box sx={{ mb: 4 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} px={1}>
        <Typography
          variant="h5" // Slightly larger for better hierarchy
          fontWeight="800"
          sx={{
            color: isOnColoredBackground ? 'common.white' : 'text.primary',
            textShadow: isOnColoredBackground ? '0 2px 4px rgba(0,0,0,0.1)' : 'none'
          }}
        >
          {title}
        </Typography>

        {onSeeAll && (
          <Button
            size="small"
            onClick={onSeeAll}
            endIcon={<ArrowForwardIcon fontSize="small" />}
            sx={{
              color: isOnColoredBackground ? 'rgba(255,255,255,0.9)' : 'text.secondary',
              '&:hover': {
                color: isOnColoredBackground ? 'common.white' : 'primary.main',
                bgcolor: isOnColoredBackground ? 'rgba(255,255,255,0.1)' : 'transparent'
              }
            }}
          >
            See all
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