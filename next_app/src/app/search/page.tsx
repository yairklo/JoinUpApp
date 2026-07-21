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
// RTL: "forward" points left
import ArrowForwardIcon from "@mui/icons-material/ArrowBack";
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
import ViewListIcon from "@mui/icons-material/ViewList";

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
  // Mobile-only: switch between results list and full-screen map
  const [mobileView, setMobileView] = useState<"list" | "map">("list");

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
        fullWidth
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
            joinPolicy={g.joinPolicy}
            viewerParticipationStatus={g.viewerParticipationStatus}
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
    <Box
      sx={{
        display: { xs: "block", md: "flex" },
        position: "relative",
        flexDirection: { md: "row" },
        height: {
          xs: "calc(100vh - 60px - 64px - env(safe-area-inset-bottom))",
          md: "calc(100vh - 68px)",
        },
      }}
    >
      {/* Filters + results pane */}
      <Box
        sx={{
          width: { xs: "100%", md: "40%" },
          height: "100%",
          // Mobile: keep both panes mounted (Leaflet needs real dimensions),
          // reveal only the active one
          position: { xs: "absolute", md: "static" },
          inset: { xs: 0, md: "auto" },
          visibility: { xs: mobileView === "list" ? "visible" : "hidden", md: "visible" },
          zIndex: { xs: mobileView === "list" ? 2 : 1, md: "auto" },
          overflowY: "auto",
          bgcolor: "background.default",
          borderInlineEnd: { md: 1 },
          borderColor: "divider",
          p: { xs: 1.5, sm: 2 },
          // Mobile: leave room above bottom nav for the floating toggle
          pb: { xs: 10, md: 2 },
        }}
      >
        {/* Search Header */}
        <Stack spacing={2} mb={3}>
          <Typography variant="h5" fontWeight={800} sx={{ fontSize: { xs: "1.25rem", sm: "1.5rem" } }}>
            חיפוש משחקים
          </Typography>

          <TextField
            placeholder="חפש קבוצה, אולם או שחקן..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            InputProps={{
              startAdornment: <SearchIcon color="action" sx={{ marginInlineEnd: 1 }} />
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
            label="כל הענפים"
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

      {/* Map pane */}
      <Box
        sx={{
          width: { xs: "100%", md: "60%" },
          height: "100%",
          position: { xs: "absolute", md: "sticky" },
          inset: { xs: 0, md: "auto" },
          visibility: { xs: mobileView === "map" ? "visible" : "hidden", md: "visible" },
          zIndex: { xs: mobileView === "map" ? 2 : 1, md: "auto" },
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

      {/* Mobile: floating list/map toggle */}
      <Button
        variant="contained"
        onClick={() => setMobileView((v) => (v === "list" ? "map" : "list"))}
        startIcon={mobileView === "list" ? <MapIcon /> : <ViewListIcon />}
        sx={{
          display: { xs: "inline-flex", md: "none" },
          position: "fixed",
          bottom: "calc(80px + env(safe-area-inset-bottom))",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 1100,
          px: 2.75,
          py: 1.1,
          minWidth: 128,
          bgcolor: "text.primary",
          color: "background.paper",
          boxShadow: "0 10px 28px rgba(2,6,23,0.35)",
          fontWeight: 700,
          "&:hover": { bgcolor: "text.primary" },
        }}
      >
        {mobileView === "list" ? "מפה" : "רשימה"}
      </Button>
    </Box>
  );
}
