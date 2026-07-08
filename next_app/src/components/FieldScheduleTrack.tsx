"use client";

import Link from "next/link";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import { SPORT_MAPPING } from "@/utils/sports";

type ScheduleGame = {
  id: string;
  title?: string | null;
  start: string;
  duration: number;
  sport: string;
  maxPlayers: number;
  price?: number | null;
  confirmedCount: number;
  date?: string;
  time?: string;
};

export default function FieldScheduleTrack({ schedule }: { schedule: ScheduleGame[] }) {
  if (!schedule || schedule.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        אין משחקים מתוכננים במגרש בשבוע הקרוב.
      </Typography>
    );
  }

  return (
    <Box
      sx={{
        display: "flex",
        gap: 2,
        overflowX: "auto",
        pb: 1,
        direction: "ltr",
        "&::-webkit-scrollbar": { height: 6 },
        "&::-webkit-scrollbar-thumb": { bgcolor: "divider", borderRadius: 3 },
      }}
    >
      {schedule.map((game) => {
        const slotsLeft = Math.max(0, game.maxPlayers - game.confirmedCount);
        const isFull = slotsLeft === 0;
        return (
          <Link key={game.id} href={`/games/${game.id}`} style={{ textDecoration: "none", flexShrink: 0 }}>
            <Card
              variant="outlined"
              sx={{
                width: 190,
                p: 2,
                direction: "rtl",
                transition: "box-shadow 0.15s, border-color 0.15s",
                "&:hover": { boxShadow: 3, borderColor: "primary.main" },
              }}
            >
              <Typography variant="subtitle2" fontWeight={700} noWrap>
                {game.title || SPORT_MAPPING[game.sport] || game.sport}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {game.date} · {game.time}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {game.duration} {game.duration === 1 ? "שעה" : "שעות"}
                {game.price ? ` · ₪${game.price}` : " · חינם"}
              </Typography>
              <Box sx={{ mt: 1 }}>
                <Chip
                  size="small"
                  label={isFull ? "מלא" : `${slotsLeft} מקומות פנויים`}
                  color={isFull ? "default" : "success"}
                  variant={isFull ? "outlined" : "filled"}
                />
              </Box>
            </Card>
          </Link>
        );
      })}
    </Box>
  );
}
