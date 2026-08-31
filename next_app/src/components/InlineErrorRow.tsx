"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import RefreshIcon from "@mui/icons-material/Refresh";

// A small inline "failed to load" row, distinct from a genuine empty-state message.
// Used by feed/list hooks (useGamesByDate, useGamesByCity, useGamesByFriends, useMyGames,
// search) when a fetch throws instead of returning a (possibly empty) result.
export default function InlineErrorRow({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Box
      sx={{
        bgcolor: (theme) => theme.palette.mode === "dark" ? "rgba(244,67,54,0.12)" : "rgba(244,67,54,0.06)",
        border: "1px solid",
        borderColor: "error.light",
        borderRadius: 2,
        p: 2,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 1.5,
        flexWrap: "wrap",
      }}
    >
      <Box display="flex" alignItems="center" gap={1}>
        <ErrorOutlineIcon color="error" fontSize="small" />
        <Typography variant="body2" color="error.dark">
          {message}
        </Typography>
      </Box>
      <Button
        size="small"
        variant="outlined"
        color="error"
        startIcon={<RefreshIcon fontSize="small" />}
        onClick={onRetry}
      >
        נסה שוב
      </Button>
    </Box>
  );
}
