"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser, useAuth } from "@clerk/nextjs";

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
  title?: string | null;
  teamSize?: number | null;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

import { SportFilter } from "@/utils/sports";

export default function MyJoinedGames({ sportFilter = "ALL" }: { sportFilter?: SportFilter }) {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
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
        const token = await getToken();
        const res = await fetch(`${API_BASE}/api/games/my`, {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error("Failed to fetch games");

        const myGames: Game[] = await res.json();
        const myUpcoming = myGames

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
          const mainTitle = g.title || g.fieldName;
          const subtitle = g.title ? `${g.fieldName} • ${g.fieldLocation}` : g.fieldLocation;

          return (
            <GameHeaderCard
              key={g.id}
              time={g.time}
              date={g.date && g.date.includes('-') ? g.date.split('-').reverse().join('/') : g.date}
              durationHours={g.duration ?? 1}
              title={mainTitle}
              subtitle={subtitle}
              currentPlayers={g.currentPlayers}
              maxPlayers={g.maxPlayers}
              sport={g.sport}
              teamSize={g.teamSize}
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