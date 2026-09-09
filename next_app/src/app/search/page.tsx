"use client";

import React, { Suspense, useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { gamesApi } from "@/services/api/games";
import { fieldsApi } from "@/services/api/fields";
import { Game } from "@/types/game";
import { SPORT_MAPPING } from "@/utils/sports";
import GameHeaderCard from "@/components/GameHeaderCard";
import JoinGameButton from "@/components/JoinGameButton";
import LeaveGameButton from "@/components/LeaveGameButton";
import InlineErrorRow from "@/components/InlineErrorRow";
import LoadingMotif from "@/components/motion/LoadingMotif";
import RouteLoading from "@/components/motion/RouteLoading";
import CityPicker, { CityPickerHandle } from "@/components/CityPicker";
import MapErrorBoundary from "@/components/MapErrorBoundary";
import { useRouter, useSearchParams } from "next/navigation";
import { getLoadErrorMessage } from "@/utils/apiError";
import { asLatLngTuple } from "@/utils/geo";
import { formatHebrewDate, HEBREW_DATE_INPUT_PROPS } from "@/utils/hebrewDate";

// MUI
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import SearchIcon from "@mui/icons-material/Search";
import GroupIcon from "@mui/icons-material/Group";

// Dynamically import the map to avoid SSR issues with Leaflet using window
const SearchMapComponent = dynamic(
  () => import("@/components/SearchMapComponent"),
  { ssr: false, loading: () => <Box p={4} display="flex" justifyContent="center"><LoadingMotif id="pin-drop" /></Box> }
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

function SearchPageInner() {
  const { getToken, userId } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const param = (key: string) => searchParams?.get(key) || "";

  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [query, setQuery] = useState(() => param("q"));
  const [debouncedQuery, setDebouncedQuery] = useState(() => param("q"));
  const [selectedSport, setSelectedSport] = useState<string | null>(() => {
    const sport = param("sport");
    return sport && SPORTS.some((s) => s.id === sport) ? sport : null;
  });
  const [selectedDate, setSelectedDate] = useState<string>(() => param("date"));
  const [selectedCity, setSelectedCity] = useState<string>(() => param("city"));
  const [networkGames, setNetworkGames] = useState(
    () => param("network") === "1" || param("network") === "true"
  );
  const [showEmptyFields, setShowEmptyFields] = useState(false);
  const [emptyFields, setEmptyFields] = useState<any[]>([]);

  const [mapBounds, setMapBounds] = useState<Bounds | null>(null);
  const lastBoundsRef = useRef<Bounds | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const [targetLocation, setTargetLocation] = useState<[number, number] | null>(() => {
    const city = param("city");
    return city && CITY_COORDS[city] ? CITY_COORDS[city] : null;
  });
  // The user's own resolved GPS position -- distinct from targetLocation
  // (which also gets set by picking a city) so the map can mark it as "you
  // are here" instead of drawing it like a game/field pin.
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  // Mobile-only: switch between results list and full-screen map
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  // Hover sync between the results list and the map pins (SearchMapComponent) --
  // hovering a card highlights its pin, hovering a pin highlights its card.
  const [hoveredGameId, setHoveredGameId] = useState<string | null>(null);

  // Geolocation lives in CityPicker. Do not assume a GPS lookup is in-flight on
  // first paint — auto-detect only runs if permission is already granted, and a
  // failed/throwing lookup must not leave the map overlay stuck or crash the page.
  const cityPickerRef = useRef<CityPickerHandle>(null);
  const [locating, setLocating] = useState(false);
  const [mapEnabled, setMapEnabled] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(min-width: 900px)").matches
  );

  useEffect(() => {
    const wide = window.matchMedia("(min-width: 900px)");
    const sync = () => {
      if (wide.matches) setMapEnabled(true);
    };
    sync();
    wide.addEventListener("change", sync);
    return () => wide.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (mobileView === "map") setMapEnabled(true);
  }, [mobileView]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 400);
    return () => clearTimeout(t);
  }, [query]);

  const performSearch = useCallback(async () => {
    // Cancel any still-in-flight search before starting a new one — without this, panning
    // the map for a few seconds fires a request every ~800ms and lets them all race to
    // completion, each one counting against the API rate limit and occasionally applying a
    // stale (out-of-order) result over a newer one.
    if (searchAbortRef.current) searchAbortRef.current.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const params = new URLSearchParams();

      if (debouncedQuery) params.append("q", debouncedQuery);
      if (selectedSport) params.append("sport", selectedSport);
      if (selectedDate) params.append("date", selectedDate);
      if (networkGames) params.append("networkGames", "true");

      if (mapBounds) {
        params.append("minLat", mapBounds.minLat.toString());
        params.append("maxLat", mapBounds.maxLat.toString());
        params.append("minLng", mapBounds.minLng.toString());
        params.append("maxLng", mapBounds.maxLng.toString());
      }

      const results = await gamesApi.search(params, token || undefined, controller.signal);
      if (controller.signal.aborted) return;
      if (!Array.isArray(results)) {
        throw new Error("תגובת החיפוש אינה תקינה");
      }

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
        const allFields = await fieldsApi.search(fieldParams, controller.signal);
        if (controller.signal.aborted) return;
        // Filter out fields that have 0 upcoming games
        const empty = allFields.filter(f => f.upcomingGamesCount === 0);
        setEmptyFields(empty);
      } else {
        setEmptyFields([]);
      }
    } catch (error) {
      if (controller.signal.aborted) return; // superseded by a newer search — not a real failure
      console.error("Search failed:", error);
      setGames([]);
      setError(getLoadErrorMessage(error));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [getToken, debouncedQuery, selectedSport, selectedDate, networkGames, mapBounds, showEmptyFields]);

  useEffect(() => {
    performSearch();
    return () => {
      searchAbortRef.current?.abort();
    };
  }, [performSearch]);

  const handleBoundsChanged = (bounds: Bounds) => {
    // Leaflet fires moveend/zoomend for reasons that don't reflect a real user pan/zoom too —
    // e.g. the map container being resized when the mobile list/map panes swap visibility, or a
    // sub-pixel nudge during a fitBounds animation. Skip re-searching unless the viewport moved
    // by a meaningful amount, so those spurious events don't each cost a network request.
    const prev = lastBoundsRef.current;
    if (prev) {
      const latSpan = Math.max(bounds.maxLat - bounds.minLat, 0.0001);
      const lngSpan = Math.max(bounds.maxLng - bounds.minLng, 0.0001);
      const centerShiftLat = Math.abs(
        (bounds.minLat + bounds.maxLat) / 2 - (prev.minLat + prev.maxLat) / 2
      );
      const centerShiftLng = Math.abs(
        (bounds.minLng + bounds.maxLng) / 2 - (prev.minLng + prev.maxLng) / 2
      );
      const spanChanged =
        Math.abs(latSpan - (prev.maxLat - prev.minLat)) / latSpan > 0.05 ||
        Math.abs(lngSpan - (prev.maxLng - prev.minLng)) / lngSpan > 0.05;
      const centerMoved = centerShiftLat / latSpan > 0.05 || centerShiftLng / lngSpan > 0.05;
      if (!spanChanged && !centerMoved) return;
    }
    lastBoundsRef.current = bounds;
    setMapBounds(bounds);
  };

  const handleGameJoined = useCallback((gameId: string) => {
    setGames(prev => prev.map(g => {
      if (g.id === gameId) {
        return {
          ...g,
          viewerParticipationStatus: "CONFIRMED",
          currentPlayers: g.currentPlayers + 1,
          participants: [...(g.participants || []), { id: userId, status: "CONFIRMED" }] as any
        };
      }
      return g;
    }));
  }, [userId]);

  const handleGameLeft = useCallback((gameId: string) => {
    setGames(prev => prev.map(g => {
      if (g.id === gameId) {
        return {
          ...g,
          viewerParticipationStatus: null,
          currentPlayers: Math.max(0, g.currentPlayers - 1),
          participants: (g.participants || []).filter((p: any) => p.id !== userId)
        };
      }
      return g;
    }));
  }, [userId]);

  const renderGameCard = (g: Game) => {
    const joined = !!userId && (g.viewerParticipationStatus === 'CONFIRMED' || (g.participants || []).some((p: any) => p.id === userId));
    const mainTitle = g.title || g.fieldName;
    const subtitle = g.title ? `${g.fieldName} • ${g.fieldLocation}` : g.fieldLocation;

    const isHovered = g.id === hoveredGameId;

    return (
      <Box
        key={g.id}
        onMouseEnter={() => setHoveredGameId(g.id)}
        onMouseLeave={() => setHoveredGameId(null)}
        sx={{
          borderRadius: 3,
          transition: "box-shadow 150ms ease, background-color 150ms ease",
          boxShadow: isHovered ? "0 0 0 2px rgba(37,99,235,0.55)" : "none",
          bgcolor: isHovered ? "action.hover" : "transparent",
        }}
      >
        <GameHeaderCard
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
          isFriendsOnly={g.isFriendsOnly}
          fullWidth
          href={`/games/${g.id}`}
        >
          {joined ? (
            <LeaveGameButton
              gameId={g.id}
              currentPlayers={g.currentPlayers}
              onLeft={() => handleGameLeft(g.id)}
            />
          ) : (
            <JoinGameButton
              gameId={g.id}
              registrationOpensAt={g.registrationOpensAt}
              joinPolicy={g.joinPolicy}
              viewerParticipationStatus={g.viewerParticipationStatus}
              onJoined={() => handleGameJoined(g.id)}
            />
          )}
        </GameHeaderCard>
      </Box>
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
      {/* Filters + results pane. Fixed max width (not a % of the viewport) so a
          single-column card list doesn't stretch into an oversized column on
          wide desktop monitors -- the map pane below picks up the remaining
          space via flex: 1 instead of a matching percentage. */}
      <Box
        sx={{
          width: { xs: "100%", md: 420, lg: 460 },
          flexShrink: { md: 0 },
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
            מפת משחקים
          </Typography>

          {/* Copy kept honest with what this page actually queries: only /api/games/search
              (gamesApi.search), so we don't promise player search here. Note: a real global
              people/fields/games search already exists (searchApi.global -> /api/search/global,
              used by GlobalSearchOmnibar in the header) but this page doesn't call it — wiring
              it in would be a bigger scope change than a copy fix, so left as a follow-up. */}
          <TextField
            placeholder="חפש לפי שם קבוצה, אולם או ענף ספורט..."
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

          </Stack>

          <Box id="search-city-select">
            <CityPicker
              ref={cityPickerRef}
              value={selectedCity}
              onChange={(city) => {
                setSelectedCity(city);
                if (city && CITY_COORDS[city]) {
                  setTargetLocation(CITY_COORDS[city]);
                }
              }}
              includeAllCitiesOption
              allowGeolocation
              detectOnMount={!(selectedCity && CITY_COORDS[selectedCity])}
              onLocationDetected={(coords) => {
                const tuple = asLatLngTuple(coords);
                if (!tuple) return;
                setTargetLocation(tuple);
                setUserLocation(tuple);
              }}
              onLocatingChange={setLocating}
              fullWidth
            />
          </Box>

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
              slotProps={{ htmlInput: HEBREW_DATE_INPUT_PROPS }}
              helperText={selectedDate ? formatHebrewDate(selectedDate) : " "}
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

        <Typography variant="subtitle2" color="text.secondary" mb={2} minHeight="1.5em">
          {loading || locating ? null : `${games.length} משחקים נמצאו`}
        </Typography>

        {loading && games.length === 0 ? (
          <Box display="flex" justifyContent="center" p={4}>
            <LoadingMotif id="dribble" label="טוען משחקים…" />
          </Box>
        ) : error && games.length === 0 ? (
          <InlineErrorRow message={error} onRetry={performSearch} />
        ) : (
          <Stack spacing={2}>
            {games.map(renderGameCard)}
            {!loading && !locating && games.length === 0 && (
              <SearchEmptyState
                noLocation={!userLocation && !targetLocation}
                filtersActive={!!(selectedSport || selectedDate || selectedCity || networkGames || debouncedQuery || showEmptyFields)}
                onPickCity={() => {
                  document.getElementById("search-city-select")?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
                onClearFilters={() => {
                  setSelectedSport(null);
                  setSelectedDate("");
                  setQuery("");
                  setDebouncedQuery("");
                  setNetworkGames(false);
                  setShowEmptyFields(false);
                  setSelectedCity("");
                  // The city selection may have moved targetLocation away from the user's
                  // actual GPS position -- snap back to it if we already have it, otherwise
                  // (re)try detecting it, instead of leaving the map centered on the city
                  // that was just cleared.
                  if (userLocation) {
                    setTargetLocation(userLocation);
                  } else {
                    cityPickerRef.current?.detectLocation();
                  }
                }}
              />
            )}
          </Stack>
        )}
      </Box>

      {/* Map pane -- fills whatever width the fixed-width list pane doesn't use. */}
      <Box
        sx={{
          width: { xs: "100%" },
          flex: { md: 1 },
          minWidth: 0,
          height: "100%",
          position: { xs: "absolute", md: "sticky" },
          inset: { xs: 0, md: "auto" },
          visibility: { xs: mobileView === "map" ? "visible" : "hidden", md: "visible" },
          zIndex: { xs: mobileView === "map" ? 2 : 1, md: "auto" },
          top: 0,
        }}
      >
        {mapEnabled ? (
          <MapErrorBoundary>
            <SearchMapComponent
              games={games}
              emptyFields={emptyFields}
              onBoundsChanged={handleBoundsChanged}
              onGameSelect={(id) => router.push(`/games/${id}`)}
              targetLocation={targetLocation}
              userLocation={userLocation}
              loading={loading || locating}
              hoveredGameId={hoveredGameId}
              onHoverGame={setHoveredGameId}
            />
          </MapErrorBoundary>
        ) : (
          <Box sx={{ height: "100%", bgcolor: "action.hover" }} />
        )}
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

function SearchEmptyState({
  noLocation,
  filtersActive,
  onPickCity,
  onClearFilters,
}: {
  noLocation: boolean;
  filtersActive: boolean;
  onPickCity: () => void;
  onClearFilters: () => void;
}) {
  if (noLocation) {
    return (
      <Box textAlign="center" p={4} bgcolor="action.hover" borderRadius={2}>
        <Typography color="text.secondary" mb={2}>
          הפעל מיקום או בחר עיר כדי לראות משחקים באזורך
        </Typography>
        <Button variant="contained" size="small" onClick={onPickCity}>
          בחר עיר
        </Button>
      </Box>
    );
  }
  if (filtersActive) {
    return (
      <Box textAlign="center" p={4} bgcolor="action.hover" borderRadius={2}>
        <Typography color="text.secondary" mb={2}>
          לא נמצאו תוצאות לפילטרים שנבחרו
        </Typography>
        <Button variant="outlined" size="small" onClick={onClearFilters}>
          נקה פילטרים
        </Button>
      </Box>
    );
  }
  return (
    <Box textAlign="center" p={4} bgcolor="action.hover" borderRadius={2}>
      <Typography color="text.secondary" mb={2}>
        לא נמצאו משחקים השבוע באזור זה — נסה להרחיב טווח חיפוש או ליצור משחק חדש
      </Typography>
      <Button component={Link} href="/games/new" variant="outlined" size="small">
        יצירת משחק
      </Button>
    </Box>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<RouteLoading id="dribble" label="טוען חיפוש…" />}>
      <SearchPageInner />
    </Suspense>
  );
}

