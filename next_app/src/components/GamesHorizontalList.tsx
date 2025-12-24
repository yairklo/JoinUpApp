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
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ mb: 4 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} px={1}>
        <Typography variant="h6" fontWeight="bold">
          {title}
        </Typography>
        <Button size="small" endIcon={<ArrowForwardIcon fontSize="small" />} sx={{ color: "text.secondary" }}>
          See all
        </Button>
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