"use client";

import React, { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@clerk/nextjs";
import { gamesApi } from "@/services/api/games";
import { Game } from "@/types/game";
import GameHeaderCard from "@/components/GameHeaderCard";
import JoinGameButton from "@/components/JoinGameButton";
import LeaveGameButton from "@/components/LeaveGameButton";
import Link from "next/link";
import { useRouter } from "next/navigation";

// MUI
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

// Dynamically import the map to avoid SSR issues with Leaflet using window
const SearchMapComponent = dynamic(
  () => import("@/components/SearchMapComponent"),
  { ssr: false, loading: () => <Box p={4} display="flex" justifyContent="center"><CircularProgress /></Box> }
);

const SPORTS = [
  { id: "SOCCER", label: "כדורגל" },
  { id: "BASKETBALL", label: "כדורסל" },
  { id: "TENNIS", label: "טניס" },
  { id: "VOLLEYBALL", label: "כדורעף" }
];

type Bounds = { minLat: number; maxLat: number; minLng: number; maxLng: number };

export default function SearchPage() {
  const { getToken, userId } = useAuth();
  const router = useRouter();

  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(""); // YYYY-MM-DD
  const [mapBounds, setMapBounds] = useState<Bounds | null>(null);

  const performSearch = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams();

      if (selectedSport) params.append("sport", selectedSport);
      if (selectedDate) params.append("date", selectedDate);

      if (mapBounds) {
        params.append("minLat", mapBounds.minLat.toString());
        params.append("maxLat", mapBounds.maxLat.toString());
        params.append("minLng", mapBounds.minLng.toString());
        params.append("maxLng", mapBounds.maxLng.toString());
      }

      const results = await gamesApi.search(params, token || undefined);
      
      // If no specific date is provided, filter for upcoming 7 days visually as well (mirror mobile)
      let finalGames = results;
      if (!selectedDate) {
        const now = new Date();
        const nextWeek = new Date(now);
        nextWeek.setDate(nextWeek.getDate() + 7);

        finalGames = finalGames.filter(game => {
          if (!game.date) return true;
          const [year, month, day] = game.date.split('-').map(Number);
          const [hours, minutes] = (game.time || "00:00").split(':').map(Number);
          const gameDateTime = new Date(year, month - 1, day, hours, minutes, 0);

          if (game.duration) {
            gameDateTime.setMinutes(gameDateTime.getMinutes() + game.duration);
          } else {
            gameDateTime.setHours(gameDateTime.getHours() + 2);
          }

          return gameDateTime > now && gameDateTime <= nextWeek;
        });
      }

      setGames(finalGames);
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setLoading(false);
    }
  }, [getToken, selectedSport, selectedDate, mapBounds]);

  useEffect(() => {
    performSearch();
  }, [performSearch]);

  const handleBoundsChanged = (bounds: Bounds) => {
    setMapBounds(bounds);
  };

  const renderGameCard = (g: Game) => {
    const joined = !!userId && (g.participants || []).some((p: any) => p.id === userId);
    const mainTitle = g.title || g.fieldName;
    const subtitle = g.title ? `${g.fieldName} • ${g.fieldLocation}` : g.fieldLocation;

    return (
      <GameHeaderCard
        key={g.id}
        time={g.time}
        date={g.date && g.date.includes('-') ? g.date.split('-').reverse().join('/') : g.date}
        durationHours={g.duration ?? 1}
        title={mainTitle || "Game"}
        subtitle={subtitle || ""}
        currentPlayers={g.currentPlayers}
        maxPlayers={g.maxPlayers}
        sport={g.sport}
        teamSize={g.teamSize}
        price={g.price}
        isJoined={joined}
      >
        {joined ? (
          <LeaveGameButton
            gameId={g.id}
            currentPlayers={g.currentPlayers}
            onLeft={performSearch}
          />
        ) : (
          <JoinGameButton
            gameId={g.id}
            registrationOpensAt={g.registrationOpensAt}
            onJoined={performSearch}
          />
        )}
        <Link href={`/games/${g.id}`} passHref legacyBehavior>
          <Button component="a" variant="text" color="primary" size="small" endIcon={<ArrowForwardIcon />}>
            פרטים
          </Button>
        </Link>
      </GameHeaderCard>
    );
  };

  return (
    <Box sx={{ display: "flex", flexDirection: { xs: "column-reverse", md: "row" }, height: "calc(100vh - 64px)" }}>
      {/* LEFT PANE: List & Filters (40%) */}
      <Box
        sx={{
          width: { xs: "100%", md: "40%" },
          height: { xs: "50%", md: "100%" },
          overflowY: "auto",
          bgcolor: "background.default",
          borderRight: { md: 1 },
          borderColor: "divider",
          p: 2,
        }}
      >
        <Typography variant="h5" fontWeight={800} mb={3}>
          Find Games
        </Typography>

        {/* Date Picker */}
        <TextField
          label="תאריך (Date)"
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
          fullWidth
          margin="normal"
          size="small"
        />

        {/* Sport Filters */}
        <Stack direction="row" spacing={1} sx={{ overflowX: "auto", pb: 1, mb: 2 }}>
          <Chip
            label="All Sports"
            onClick={() => setSelectedSport(null)}
            color={!selectedSport ? "primary" : "default"}
            variant={!selectedSport ? "filled" : "outlined"}
            sx={{ fontWeight: 600 }}
          />
          {SPORTS.map(s => (
            <Chip
              key={s.id}
              label={s.label}
              onClick={() => setSelectedSport(s.id)}
              color={selectedSport === s.id ? "primary" : "default"}
              variant={selectedSport === s.id ? "filled" : "outlined"}
              sx={{ fontWeight: 600 }}
            />
          ))}
        </Stack>

        <Typography variant="subtitle2" color="text.secondary" mb={2}>
          {games.length} משחקים נמצאו
        </Typography>

        {loading && games.length === 0 ? (
          <Box display="flex" justifyContent="center" p={4}>
            <CircularProgress />
          </Box>
        ) : (
          <Stack spacing={2}>
            {games.map(renderGameCard)}
            {games.length === 0 && (
              <Box textAlign="center" p={4} bgcolor="action.hover" borderRadius={2}>
                <Typography color="text.secondary">לא נמצאו משחקים באזור זה</Typography>
              </Box>
            )}
          </Stack>
        )}
      </Box>

      {/* RIGHT PANE: Map (60%) */}
      <Box
        sx={{
          width: { xs: "100%", md: "60%" },
          height: { xs: "50%", md: "100%" },
          position: { md: "sticky" },
          top: 0,
        }}
      >
        <SearchMapComponent
          games={games}
          onBoundsChanged={handleBoundsChanged}
          onGameSelect={(id) => router.push(`/games/${id}`)}
        />
      </Box>
    </Box>
  );
}
