"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser, useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

import GameHeaderCard from "@/components/GameHeaderCard";
import LeaveGameButton from "@/components/LeaveGameButton";
import GamesHorizontalList from "@/components/GamesHorizontalList";

import { useSyncedGames } from "@/hooks/useSyncedGames";
import { Game } from "@/types/game";
import { useGameUpdate } from "@/context/GameUpdateContext";
import { SportFilter } from "@/utils/sports";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

export default function MyJoinedGames({ sportFilter = "ALL" }: { sportFilter?: SportFilter }) {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const userId = user?.id || "";
  const { games, setGames } = useSyncedGames([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const { notifyGameUpdate } = useGameUpdate();

  // useGameUpdateListener is handled by useSyncedGames

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
        const myUpcoming = myGames;

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
  }, [userId, isLoaded, getToken, setGames]);

  // Derive the list: only show games where I am still a participant
  const joinedGames = games.filter((g) => {
    return g.participants?.some((p) => p.id === userId);
  });

  const filteredGames = joinedGames.filter((g) => {
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
              price={g.price}
              isJoined={true}
            >
              <LeaveGameButton
                gameId={g.id}
                onLeft={() => {
                  notifyGameUpdate(g.id, 'leave', userId);
                  router.refresh();
                }}
              />

              <Button
                component={Link}
                href={`/games/${g.id}`}
                variant="text"
                color="primary"
                size="small"
                endIcon={<ArrowForwardIcon />}
              >
                פרטים
              </Button>
            </GameHeaderCard>
          );
        })}
      </GamesHorizontalList>
    </Box>
  );
}