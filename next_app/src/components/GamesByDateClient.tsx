"use client";

import { useEffect, useMemo, useState } from "react";
import { useUser, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";

import GamesDateNav from "@/components/GamesDateNav";
import GameHeaderCard from "@/components/GameHeaderCard";
import JoinGameButton from "@/components/JoinGameButton";
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
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

export default function GamesByDateClient({
  initialDate,
  fieldId,
}: {
  initialDate: string;
  fieldId?: string;
}) {
  const [selectedDate, setSelectedDate] = useState<string>(initialDate);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);
  const { user, isLoaded } = useUser(); // Added isLoaded to wait for auth check
  const { getToken } = useAuth();
  const userId = user?.id || "";

  const groups = useMemo(() => {
    return games.reduce<Record<string, Game[]>>((acc, g) => {
      (acc[g.date] ||= []).push(g);
      return acc;
    }, {});
  }, [games]);

  useEffect(() => {
    let ignore = false;
    
    // Wait until Clerk determines if user is logged in or not
    if (!isLoaded) return;

    async function run() {
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        qs.set("date", selectedDate);
        if (fieldId) qs.set("fieldId", fieldId);

        // Try to get token
        const token = await getToken({ template: undefined }).catch(() => "");
        
        // Critical Logic Fix:
        // If we have a token, use /search (personalized).
        // If NO token, use /public (guaranteed access for guests).
        const endpoint = token ? "/api/games/search" : "/api/games/public";
        const url = `${API_BASE}${endpoint}?${qs.toString()}`;

        const res = await fetch(url, {
          cache: "no-store",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (!res.ok) throw new Error("Failed to fetch games");
        const data: Game[] = await res.json();

        const now = new Date();
        const filtered = data.filter((g) => {
          const start = new Date(`${g.date}T${g.time}:00`);
          const end = new Date(start.getTime() + (g.duration ?? 1) * 3600000);
          return end >= now;
        });

        filtered.sort(
          (a, b) =>
            new Date(`${a.date}T${a.time}:00`).getTime() -
            new Date(`${b.date}T${b.time}:00`).getTime()
        );

        if (!ignore) setGames(filtered);
      } catch (err) {
        console.error("Error loading games:", err);
        if (!ignore) setGames([]);
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    run();
    return () => {
      ignore = true;
    };
  }, [selectedDate, fieldId, isLoaded, getToken]); // Added dependencies

  const currentDayGames = groups[selectedDate] || [];

  return (
    <Box>
      <Box display="flex" alignItems="center" gap={1} mb={1} px={1}>
        <CalendarTodayIcon color="primary" />
        <Typography variant="h6" fontWeight="bold">
          Browse by Date
        </Typography>
      </Box>

      <Box mb={2}>
        <GamesDateNav
          selectedDate={selectedDate}
          fieldId={fieldId}
          onSelectDate={(d) => setSelectedDate(d)}
        />
      </Box>

      {loading ? (
        <Box display="flex" justifyContent="center" p={4}>
          <CircularProgress size={30} />
        </Box>
      ) : games.length === 0 ? (
        <Box
          sx={{
            bgcolor: "action.hover",
            borderRadius: 2,
            p: 4,
            textAlign: "center",
          }}
        >
          <Typography variant="body1" color="text.secondary">
            No games found on {selectedDate}.
          </Typography>
          <Button
            size="small"
            sx={{ mt: 1 }}
            onClick={() => setSelectedDate(new Date().toISOString().split("T")[0])}
          >
            Back to Today
          </Button>
        </Box>
      ) : (
        <GamesHorizontalList title={`Games on ${selectedDate}`}>
          {currentDayGames.map((g) => {
            const joined = !!userId && (g.participants || []).some((p) => p.id === userId);
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
        </GamesHorizontalList>
      )}
    </Box>
  );
}