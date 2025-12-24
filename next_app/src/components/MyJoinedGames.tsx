"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";

// MUI Imports
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

// Custom Components
import GameHeaderCard from "@/components/GameHeaderCard";
import JoinGameButton from "@/components/JoinGameButton";
import LeaveGameButton from "@/components/LeaveGameButton";

type Game = {
  id: string;
  fieldId: string;
  fieldName: string;
  fieldLocation: string;
  date: string;
  time: string;
  duration?: number;
  maxPlayers: number;
  currentPlayers: number;
  participants?: Array<{ id: string; name?: string | null }>;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

export default function MyJoinedGames() {
  const { user } = useUser();
  const userId = user?.id || "";
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let ignore = false;
    async function run() {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/games`, { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to fetch games");
        const all: Game[] = await res.json();
        const now = new Date();
        const mine = all
          .filter((g) => (g.participants || []).some((p) => p.id === userId))
          .filter((g) => {
            const start = new Date(`${g.date}T${g.time}:00`);
            const end = new Date(start.getTime() + (g.duration ?? 1) * 3600000);
            return end >= now;
          })
          .sort(
            (a, b) =>
              new Date(`${a.date}T${a.time}:00`).getTime() -
              new Date(`${b.date}T${b.time}:00`).getTime()
          );
        if (!ignore) setGames(mine);
      } catch {
        if (!ignore) setGames([]);
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    run();
    return () => {
      ignore = true;
    };
  }, [userId]);

  if (!userId) return null;
  if (loading) return <Box display="flex" justifyContent="center" p={2}><CircularProgress /></Box>;
  if (games.length === 0) return null;

  return (
    <Box mb={4}>
      <Typography variant="h5" component="h2" fontWeight="bold" gutterBottom>
        Your Upcoming Games
      </Typography>
      
      <Stack spacing={2}>
        {games.map((g) => {
          const joined = true; // Since this component filters for joined games
          const title = `${g.fieldName} • ${g.fieldLocation}`;
          
          return (
            <GameHeaderCard
              key={g.id}
              time={g.time}
              durationHours={g.duration ?? 1}
              title={title}
              currentPlayers={g.currentPlayers}
              maxPlayers={g.maxPlayers}
            >
              {joined ? (
                <LeaveGameButton gameId={g.id} />
              ) : (
                <JoinGameButton gameId={g.id} />
              )}
              
              <Link href={`/games/${g.id}`} passHref legacyBehavior>
                <Button 
                  component="a"
                  variant="text" 
                  color="primary" 
                  size="small" 
                  endIcon={<ArrowForwardIcon />}
                >
                  Details
                </Button>
              </Link>
            </GameHeaderCard>
          );
        })}
      </Stack>
    </Box>
  );
}