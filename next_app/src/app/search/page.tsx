"use client";

import React, { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@clerk/nextjs";
import { gamesApi } from "@/services/api/games";
import { fieldsApi } from "@/services/api/fields";
import { Game } from "@/types/game";
import { SPORT_MAPPING } from "@/utils/sports";
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
import MenuItem from "@mui/material/MenuItem";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import SearchIcon from "@mui/icons-material/Search";
import GroupIcon from "@mui/icons-material/Group";

// Dynamically import the map to avoid SSR issues with Leaflet using window
const SearchMapComponent = dynamic(
  () => import("@/components/SearchMapComponent"),
  { ssr: false, loading: () => <Box p={4} display="flex" justifyContent="center"><CircularProgress /></Box> }
);

const SPORTS = Object.entries(SPORT_MAPPING).map(([id, label]) => ({ id, label }));

const CITY_COORDS: Record<string, [number, number]> = {
  'תל אביב-יפו': [32.0853, 34.7818],
  'תל אביב': [32.0853, 34.7818],
  'ירושלים': [31.7683, 35.2137],
  'חיפה': [32.7940, 34.9896],
  'ראשון לציון': [31.9730, 34.7925],
  'פתח תקווה': [32.0840, 34.8878],
  'אשדוד': [31.8014, 34.6435],
  'נתניה': [32.3215, 34.8532],
  'באר שבע': [31.2518, 34.7913],
  'חולון': [32.0158, 34.7874],
  'רמת גן': [32.0684, 34.8248],
  'הרצליה': [32.1624, 34.8447],
  'רעננה': [32.1848, 34.8713],
  'כפר סבא': [32.1713, 34.9069],
  'אילת': [29.5577, 34.9519],
  'רחובות': [31.8928, 34.8113],
  'מודיעין': [31.9056, 35.0006]
};

import MapIcon from "@mui/icons-material/Map";

type Bounds = { minLat: number; maxLat: number; minLng: number; maxLng: number };

export default function SearchPage() {
  const { getToken, userId } = useAuth();
  const router = useRouter();

  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Filters
  const [query, setQuery] = useState("");
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(""); // YYYY-MM-DD
  const [selectedCity, setSelectedCity] = useState<string>("");
  const [networkGames, setNetworkGames] = useState(false);
  const [showEmptyFields, setShowEmptyFields] = useState(false);
  const [emptyFields, setEmptyFields] = useState<any[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  
  const [mapBounds, setMapBounds] = useState<Bounds | null>(null);
  const [targetLocation, setTargetLocation] = useState<[number, number] | null>(null);

  useEffect(() => {
    fieldsApi.getCities().then(res => setCities(res)).catch(console.error);
  }, []);

  const performSearch = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams();

      if (query) params.append("q", query);
      if (selectedSport) params.append("sport", selectedSport);
      if (selectedDate) params.append("date", selectedDate);
      if (networkGames) params.append("networkGames", "true");

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

      // Fetch empty fields in bounding box if filter is enabled
      if (showEmptyFields && mapBounds) {
        const fieldParams = new URLSearchParams();
        fieldParams.append("minLat", mapBounds.minLat.toString());
        fieldParams.append("maxLat", mapBounds.maxLat.toString());
        fieldParams.append("minLng", mapBounds.minLng.toString());
        fieldParams.append("maxLng", mapBounds.maxLng.toString());
        if (selectedDate) {
          fieldParams.append("date", selectedDate);
        }
        const allFields = await fieldsApi.search(fieldParams);
        // Filter out fields that have 0 upcoming games
        const empty = allFields.filter(f => f.upcomingGamesCount === 0);
        setEmptyFields(empty);
      } else {
        setEmptyFields([]);
      }
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setLoading(false);
    }
  }, [getToken, query, selectedSport, selectedDate, networkGames, mapBounds, showEmptyFields]);

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
        {/* Search Header */}
        <Stack spacing={2} mb={3}>
          <Typography variant="h5" fontWeight={800}>
            Find Games
          </Typography>

          <TextField
            placeholder="חפש קבוצה, אולם או שחקן..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            InputProps={{
              startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} />
            }}
            fullWidth
            size="small"
          />

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button
              variant={networkGames ? "contained" : "outlined"}
              size="small"
              onClick={() => setNetworkGames(!networkGames)}
              startIcon={<GroupIcon />}
              sx={{ borderRadius: 8, textTransform: "none", fontWeight: 600 }}
            >
              רשת המכרים
            </Button>

            <Button
              variant={showEmptyFields ? "contained" : "outlined"}
              size="small"
              onClick={() => setShowEmptyFields(!showEmptyFields)}
              startIcon={<MapIcon />}
              sx={{ borderRadius: 8, textTransform: "none", fontWeight: 600 }}
            >
              מגרשים פנויים
            </Button>

            <TextField
              select
              value={selectedCity}
              onChange={(e) => {
                const city = e.target.value;
                setSelectedCity(city);
                if (city && CITY_COORDS[city]) {
                  setTargetLocation(CITY_COORDS[city]);
                }
              }}
              size="small"
              sx={{ minWidth: 120 }}
              label="עיר"
            >
              <MenuItem value="">כל הערים</MenuItem>
              {cities.map((city) => (
                <MenuItem key={city} value={city}>{city}</MenuItem>
              ))}
            </TextField>
          </Stack>

          {/* Date Picker Section with "השבוע הקרוב" Chip */}
          <Stack direction="row" spacing={1} alignItems="center" width="100%">
            <Chip
              label="השבוע הקרוב"
              onClick={() => setSelectedDate("")}
              color={!selectedDate ? "primary" : "default"}
              variant={!selectedDate ? "filled" : "outlined"}
              sx={{ fontWeight: 600, height: 40, px: 1 }}
            />
            <TextField
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              size="small"
              fullWidth
            />
          </Stack>
        </Stack>

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
          emptyFields={emptyFields}
          onBoundsChanged={handleBoundsChanged}
          onGameSelect={(id) => router.push(`/games/${id}`)}
          targetLocation={targetLocation}
        />
      </Box>
    </Box>
  );
}
