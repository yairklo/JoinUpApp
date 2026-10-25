"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { formatEveningSummary, type EveningSummary } from "@joinup/shared/eveningSummary";

/** Editor preview and saved board: same lines, same legend. */
export default function EveningSummaryLines({
  summary,
  sport,
  nameOf,
  testId,
}: {
  summary: EveningSummary;
  sport: string;
  nameOf: (userId: string) => string;
  testId: string;
}) {
  const lines = formatEveningSummary({
    teams: summary.teams,
    players: summary.players.map((player) => ({ ...player, name: nameOf(player.userId) })),
    sport,
  });
  return (
    <Box data-testid={testId} sx={{ p: 1.5, borderRadius: 2, bgcolor: "action.hover" }}>
      <Typography variant="subtitle2" fontWeight={800}>סיכום הערב</Typography>
      <Typography variant="caption" color="text.secondary" display="block" mb={0.5} data-testid={`${testId}-legend`}>
        {lines.legend}
      </Typography>
      {lines.teams.map((row) => (
        <Typography key={row.key} variant="body2">{row.line}</Typography>
      ))}
      {lines.players.map((row) => (
        <Typography key={row.key} variant="body2" color="text.secondary">{row.line}</Typography>
      ))}
    </Box>
  );
}
