"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  APIProvider,
  Map as GoogleMap,
  AdvancedMarker,
  InfoWindow,
  useMap,
} from "@vis.gl/react-google-maps";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import { Game } from "@/types/game";
import { SPORT_MAPPING, SPORT_EMOJI } from "@/utils/sports";

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

interface SearchMapComponentProps {
  games: Game[];
  emptyFields?: any[];
  onBoundsChanged?: (bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }) => void;
  onGameSelect?: (gameId: string) => void;
  targetLocation?: [number, number] | null;
}

const SPORT_COLORS: Record<string, string> = {
  SOCCER: "#16a34a", // green-600
  BASKETBALL: "#f97316", // orange-500
  TENNIS: "#eab308", // yellow-500
};

// Games can arrive with either the DB enum ("SOCCER") or a free-text Hebrew
// label — normalize both to one key so color/emoji/label lookups agree.
const normalizeSportKey = (sport?: string): keyof typeof SPORT_COLORS | null => {
  const s = sport?.toLowerCase() || "";
  if (s.includes("כדורגל") || s.includes("soccer") || s.includes("football")) return "SOCCER";
  if (s.includes("כדורסל") || s.includes("basketball")) return "BASKETBALL";
  if (s.includes("טניס") || s.includes("tennis")) return "TENNIS";
  return null;
};

const getSportColorHex = (sport?: string) => {
  const key = normalizeSportKey(sport);
  return key ? SPORT_COLORS[key] : "#2563eb"; // blue-600 fallback
};

const getSportVisual = (sport?: string) => {
  const key = normalizeSportKey(sport);
  return {
    color: key ? SPORT_COLORS[key] : "#2563eb",
    emoji: key ? SPORT_EMOJI[key] : "🏅",
    label: key ? SPORT_MAPPING[key] : sport || "משחק",
  };
};

// "2026-08-27" -> "27.8" — compact enough to sit next to the time in a popup row.
const formatShortDate = (dateStr?: string) => {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-");
  if (!year || !month || !day) return dateStr;
  return `${Number(day)}.${Number(month)}`;
};

type GameGroup = { key: string; lat: number; lng: number; games: Game[] };

export default function SearchMapComponent({ games, emptyFields = [], onBoundsChanged, onGameSelect, targetLocation }: SearchMapComponentProps) {
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number }>({ lat: 32.0853, lng: 34.7818 }); // Default Tel Aviv

  // Attempt to get user geolocation on mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {} // Silent fallback to default
      );
    }
  }, []);

  // Group games that have identical coordinates so they don't visually overlap perfectly
  const groupedGames: GameGroup[] = useMemo(() => {
    const map = new Map<string, GameGroup>();
    for (const game of games) {
      const lat = game.customLat ?? game.fieldLat ?? game.field?.lat;
      const lng = game.customLng ?? game.fieldLng ?? game.field?.lng;
      if (typeof lat !== "number" || typeof lng !== "number") continue;
      const key = `${lat},${lng}`;
      const existing = map.get(key);
      if (existing) existing.games.push(game);
      else map.set(key, { key, lat, lng, games: [game] });
    }
    return Array.from(map.values());
  }, [games]);

  if (!GOOGLE_MAPS_API_KEY) {
    return <div style={{ color: "#64748b", fontSize: 14, padding: 16 }}>מפה לא זמינה כרגע.</div>;
  }

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <APIProvider apiKey={GOOGLE_MAPS_API_KEY} language="he">
        <GoogleMap
          mapId="DEMO_MAP_ID"
          defaultCenter={userLocation}
          defaultZoom={12}
          gestureHandling="greedy"
          disableDefaultUI={false}
          style={{ width: "100%", height: "100%" }}
        >
          <BoundsListener onBoundsChanged={onBoundsChanged} targetLocation={targetLocation} />

          {groupedGames.map((group) => (
            <GameGroupMarker key={group.key} group={group} onGameSelect={onGameSelect} />
          ))}

          {emptyFields.map((field, idx) => {
            if (typeof field.lat !== "number" || typeof field.lng !== "number") return null;
            return <EmptyFieldMarker key={`empty-${idx}`} field={field} />;
          })}
        </GoogleMap>
      </APIProvider>
    </div>
  );
}

// Recenters/zooms the map when a city is picked from the filters, and reports
// debounced viewport bounds back up whenever the camera settles.
function BoundsListener({
  onBoundsChanged,
  targetLocation,
}: {
  onBoundsChanged?: (bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }) => void;
  targetLocation?: [number, number] | null;
}) {
  const map = useMap();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCameraChanged = useCallback(() => {
    if (!map) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    // Debounce so a continuous pan/zoom doesn't fire a search on every intermediate stop.
    timeoutRef.current = setTimeout(() => {
      const b = map.getBounds();
      if (!b) return;
      const ne = b.getNorthEast();
      const sw = b.getSouthWest();
      onBoundsChanged?.({
        minLat: sw.lat(),
        maxLat: ne.lat(),
        minLng: sw.lng(),
        maxLng: ne.lng(),
      });
    }, 800);
  }, [map, onBoundsChanged]);

  useEffect(() => {
    if (!map) return;
    const idleListener = map.addListener("idle", handleCameraChanged);
    return () => {
      idleListener?.remove();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [map, handleCameraChanged]);

  useEffect(() => {
    if (targetLocation && map) {
      map.panTo({ lat: targetLocation[0], lng: targetLocation[1] });
      map.setZoom(12);
    }
  }, [targetLocation, map]);

  return null;
}

function GameGroupMarker({ group, onGameSelect }: { group: GameGroup; onGameSelect?: (gameId: string) => void }) {
  const [open, setOpen] = useState(false);
  const firstGame = group.games[0];
  const uniqueSports = Array.from(new Set(group.games.map((g) => g.sport)));
  const isMixed = uniqueSports.length > 1;
  const bgColor = isMixed ? "#64748b" : getSportColorHex(firstGame.sport);
  const count = group.games.length;

  return (
    <>
      <AdvancedMarker position={{ lat: group.lat, lng: group.lng }} onClick={() => setOpen((v) => !v)}>
        <div style={{ position: "relative", width: 36, height: 36 }}>
          <div
            style={{
              background: bgColor,
              width: "100%",
              height: "100%",
              borderRadius: "50%",
              border: "3px solid white",
              boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
          {count > 1 && (
            <div
              style={{
                position: "absolute",
                top: -5,
                right: -5,
                background: "red",
                color: "white",
                fontSize: 10,
                fontWeight: "bold",
                borderRadius: 10,
                padding: "2px 5px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
              }}
            >
              +{count}
            </div>
          )}
        </div>
      </AdvancedMarker>
      {open && (
        <InfoWindow
          position={{ lat: group.lat, lng: group.lng }}
          onCloseClick={() => setOpen(false)}
          headerDisabled
          minWidth={252}
          maxWidth={300}
          pixelOffset={[0, -10]}
        >
          <Box sx={{ p: 0.5 }}>
            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 1.25 }}>
              <PlaceRoundedIcon sx={{ fontSize: 18, color: "primary.main" }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 800, lineHeight: 1.25 }}>
                {firstGame.field?.name || firstGame.fieldName || "מיקום המשחק"}
              </Typography>
            </Stack>
            <Stack spacing={0.75}>
              {group.games.map((g) => {
                const visual = getSportVisual(g.sport);
                const isFull = g.currentPlayers >= g.maxPlayers;
                return (
                  <Box
                    key={g.id}
                    onClick={() => onGameSelect?.(g.id)}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      p: 1,
                      borderRadius: 2,
                      border: "1px solid",
                      borderColor: "divider",
                      borderInlineStartWidth: 3,
                      borderInlineStartColor: visual.color,
                      cursor: "pointer",
                      transition: "background-color 120ms ease, transform 120ms ease",
                      "&:hover": { bgcolor: "action.hover", transform: "translateY(-1px)" },
                    }}
                  >
                    <Box sx={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>{visual.emoji}</Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
                        {visual.label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatShortDate(g.date)} · {g.time}
                      </Typography>
                    </Box>
                    <Chip
                      size="small"
                      label={`${g.currentPlayers}/${g.maxPlayers}`}
                      color={isFull ? "default" : "success"}
                      variant={isFull ? "outlined" : "filled"}
                      sx={{ fontWeight: 700, height: 22, flexShrink: 0 }}
                    />
                  </Box>
                );
              })}
            </Stack>
          </Box>
        </InfoWindow>
      )}
    </>
  );
}

function EmptyFieldMarker({ field }: { field: any }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <AdvancedMarker position={{ lat: field.lat, lng: field.lng }} onClick={() => setOpen((v) => !v)}>
        <div style={{ position: "relative", width: 36, height: 36 }}>
          <div
            style={{
              backgroundColor: "#94a3b8",
              width: "100%",
              height: "100%",
              borderRadius: "50%",
              border: "3px solid white",
              boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
        </div>
      </AdvancedMarker>
      {open && (
        <InfoWindow
          position={{ lat: field.lat, lng: field.lng }}
          onCloseClick={() => setOpen(false)}
          headerDisabled
          minWidth={220}
          maxWidth={260}
          pixelOffset={[0, -10]}
        >
          <Box sx={{ p: 0.5, textAlign: "center" }}>
            <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.5} sx={{ mb: 0.5 }}>
              <PlaceRoundedIcon sx={{ fontSize: 18, color: "text.secondary" }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                {field.name}
              </Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
              {field.location || "אין מידע מיקום"}
            </Typography>
            <Button href={`/games/new?fieldId=${field.id}`} variant="contained" color="primary" fullWidth size="small">
              פתח משחק במגרש זה
            </Button>
          </Box>
        </InfoWindow>
      )}
    </>
  );
}
