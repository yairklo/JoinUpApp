"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";

import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

import GameHeaderCard from "@/components/GameHeaderCard";
import LeaveGameButton from "@/components/LeaveGameButton";
import GamesHorizontalList from "@/components/GamesHorizontalList";

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
  sport?: string;
  seriesId?: string | null;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

import { SportFilter } from "@/utils/sports";

export default function MyJoinedGames({ sportFilter = "ALL" }: { sportFilter?: SportFilter }) {
  const { user, isLoaded } = useUser();
  const userId = user?.id || "";
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoaded) return;
    if (!userId) {
      setLoading(false);
      return;
    }

    let ignore = false;
    async function fetchMyGames() {
      try {
        const res = await fetch(`${API_BASE}/api/games`, { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to fetch games");

        const allGames: Game[] = await res.json();
        const now = new Date();

        const myUpcoming = allGames
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

        // Deduplicate by seriesId, keeping the first occurrence (nearest upcoming)
        const uniqueSeries = new Set<string>();
        const dedupedGames = myUpcoming.filter((g) => {
          if (!g.seriesId) return true;
          if (uniqueSeries.has(g.seriesId)) return false;
          uniqueSeries.add(g.seriesId);
          return true;
        });

        if (!ignore) setGames(dedupedGames);
      } catch (error) {
        console.error("Failed to load my games", error);
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    fetchMyGames();
    return () => {
      ignore = true;
    };
  }, [userId, isLoaded]);

  const filteredGames = games.filter((g) => {
    if (sportFilter === "ALL") return true;
    return g.sport === sportFilter;
  });

  if (!isLoaded || loading) {
    return (
      <Box display="flex" justifyContent="center" p={2}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (filteredGames.length === 0) {
    return null;
  }

  return (
    <Box>
      {/* Shortened title and removed isOnColoredBackground since it's now on the main background */}
      <GamesHorizontalList title="המשחקים שלי">
        {filteredGames.map((g) => {
          const title = `${g.fieldName} • ${g.fieldLocation}`;

          return (
            <GameHeaderCard
              key={g.id}
              time={g.time}
              durationHours={g.duration ?? 1}
              title={title}
              currentPlayers={g.currentPlayers}
              maxPlayers={g.maxPlayers}
              sport={g.sport}
            >
              <LeaveGameButton
                gameId={g.id}
                onLeft={() => {
                  setGames(prev => prev.filter(game => game.id !== g.id));
                }}
              />

              <Link href={`/games/${g.id}`} passHref legacyBehavior>
                <Button
                  component="a"
                  variant="text"
                  color="primary"
                  size="small"
                  endIcon={<ArrowForwardIcon />}
                >
                  פרטים
                </Button>
              </Link>
            </GameHeaderCard>
          );
        })}
      </GamesHorizontalList>
    </Box>
  );
}