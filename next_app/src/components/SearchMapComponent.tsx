"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  APIProvider,
  Map as GoogleMap,
  AdvancedMarker,
  InfoWindow,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { Game } from "@/types/game";
import { SPORT_MAPPING, SPORT_EMOJI } from "@/utils/sports";
import LoadingMotif from "@/components/motion/LoadingMotif";
import { isValidLatLng } from "@/utils/geo";

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
const GOOGLE_MAPS_MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";
const MAPS_LIBRARIES: ("marker")[] = ["marker"];

interface SearchMapComponentProps {
  games: Game[];
  emptyFields?: any[];
  onBoundsChanged?: (bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }) => void;
  onGameSelect?: (gameId: string) => void;
  targetLocation?: [number, number] | null;
  // The user's own resolved GPS position (as opposed to `targetLocation`,
  // which also gets set by picking a city) -- rendered as a distinct "you
  // are here" dot instead of a game/field pin.
  userLocation?: [number, number] | null;
  loading?: boolean;
  // Synced hover state with the results list (search/page.tsx): hovering a
  // list card highlights its pin here, and hovering a pin here highlights
  // the corresponding list card via onHoverGame.
  hoveredGameId?: string | null;
  onHoverGame?: (gameId: string | null) => void;
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

// Uncontrolled initial center -- @vis.gl/react-google-maps only applies this
// once, at mount, so it's a static fallback only. The real "center on the
// user" behavior comes from `targetLocation`, which the search page sets
// once it resolves geolocation and which BoundsListener below reacts to on
// every change (see its `targetLocation` effect) -- unlike this prop, that
// one actually re-pans an already-mounted map.
const DEFAULT_CENTER = { lat: 32.0853, lng: 34.7818 }; // Tel Aviv

export default function SearchMapComponent({
  games,
  emptyFields = [],
  onBoundsChanged,
  onGameSelect,
  targetLocation,
  userLocation,
  loading = false,
  hoveredGameId = null,
  onHoverGame,
}: SearchMapComponentProps) {
  const [apiError, setApiError] = useState<unknown>(null);
  const safeUserLocation =
    userLocation && isValidLatLng(userLocation[0], userLocation[1]) ? userLocation : null;
  const safeTarget =
    targetLocation && isValidLatLng(targetLocation[0], targetLocation[1]) ? targetLocation : null;

  // Group games that have identical coordinates so they don't visually overlap perfectly
  const groupedGames: GameGroup[] = useMemo(() => {
    const map = new Map<string, GameGroup>();
    for (const game of games) {
      const lat = game.customLat ?? game.fieldLat ?? game.field?.lat;
      const lng = game.customLng ?? game.fieldLng ?? game.field?.lng;
      if (!isValidLatLng(lat, lng)) continue;
      const safeLat = Number(lat);
      const safeLng = Number(lng);
      const key = `${safeLat},${safeLng}`;
      const existing = map.get(key);
      if (existing) existing.games.push(game);
      else map.set(key, { key, lat: safeLat, lng: safeLng, games: [game] });
    }
    return Array.from(map.values());
  }, [games]);

  if (!GOOGLE_MAPS_API_KEY) {
    return <div style={{ color: "#64748b", fontSize: 14, padding: 16 }}>מפה לא זמינה כרגע.</div>;
  }

  if (apiError) {
    return (
      <div style={{ color: "#64748b", fontSize: 14, padding: 16, height: "100%" }}>
        המפה לא נטענה. אפשר להמשיך לחפש ברשימה.
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {loading && (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "rgba(248, 250, 252, 0.78)",
            pointerEvents: "none",
          }}
        >
          <LoadingMotif id="pin-drop" label="טוען מפה…" />
        </Box>
      )}
      <APIProvider
        apiKey={GOOGLE_MAPS_API_KEY}
        language="he"
        region="IL"
        libraries={MAPS_LIBRARIES}
        onError={(err) => {
          console.error("[SearchMap] Maps API error:", err);
          setApiError(err);
        }}
      >
        <GoogleMap
          mapId={GOOGLE_MAPS_MAP_ID}
          defaultCenter={DEFAULT_CENTER}
          defaultZoom={12}
          gestureHandling="greedy"
          disableDefaultUI={false}
          style={{ width: "100%", height: "100%" }}
        >
          <BoundsListener onBoundsChanged={onBoundsChanged} targetLocation={safeTarget} />

          {safeUserLocation && (
            <UserLocationMarker lat={safeUserLocation[0]} lng={safeUserLocation[1]} />
          )}

          <ClusteredGameMarkers
            groups={groupedGames}
            onGameSelect={onGameSelect}
            hoveredGameId={hoveredGameId}
            onHoverGame={onHoverGame}
          />

          {emptyFields.map((field, idx) => {
            if (!isValidLatLng(field.lat, field.lng)) return null;
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
    if (!targetLocation || !map) return;
    const [lat, lng] = targetLocation;
    if (!isValidLatLng(lat, lng)) return;
    try {
      map.panTo({ lat, lng });
      map.setZoom(12);
    } catch (e) {
      console.warn("[SearchMap] panTo failed:", e);
    }
  }, [targetLocation, map]);

  return null;
}

// Classic "you are here" blue dot -- kept visually distinct from the sport-colored
// game pins and the gray empty-field pins so it doesn't get mistaken for either.
function UserLocationMarker({ lat, lng }: { lat: number; lng: number }) {
  const markerLib = useMapsLibrary("marker");
  if (!markerLib) return null;
  return (
    <AdvancedMarker position={{ lat, lng }} zIndex={1}>
      <div style={{ position: "relative", width: 22, height: 22 }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: "rgba(37, 99, 235, 0.25)",
            animation: "joinup-user-location-pulse 2.2s ease-out infinite",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: "#2563eb",
            border: "2.5px solid white",
            boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
          }}
        />
        <style>{`
          @keyframes joinup-user-location-pulse {
            0% { transform: scale(0.6); opacity: 0.8; }
            100% { transform: scale(2.2); opacity: 0; }
          }
        `}</style>
      </div>
    </AdvancedMarker>
  );
}

// Builds the same visual as the previous declarative marker (colored circle,
// pin glyph, +N count badge for grouped games) as a plain DOM node, since
// MarkerClusterer needs direct access to real marker elements to cluster
// them -- it can't cluster React-rendered <AdvancedMarker> JSX.
function buildGroupMarkerContent(group: GameGroup): HTMLDivElement {
  const firstGame = group.games[0];
  const uniqueSports = Array.from(new Set(group.games.map((g) => g.sport)));
  const isMixed = uniqueSports.length > 1;
  const bgColor = isMixed ? "#64748b" : getSportColorHex(firstGame.sport);
  const count = group.games.length;

  const wrapper = document.createElement("div");
  wrapper.style.position = "relative";
  wrapper.style.width = "36px";
  wrapper.style.height = "36px";
  wrapper.style.cursor = "pointer";
  wrapper.style.transition = "transform 150ms ease, box-shadow 150ms ease";

  const circle = document.createElement("div");
  circle.style.background = bgColor;
  circle.style.width = "100%";
  circle.style.height = "100%";
  circle.style.borderRadius = "50%";
  circle.style.border = "3px solid white";
  circle.style.boxShadow = "0 4px 6px rgba(0,0,0,0.3)";
  circle.style.display = "flex";
  circle.style.alignItems = "center";
  circle.style.justifyContent = "center";
  circle.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>';
  wrapper.appendChild(circle);

  if (count > 1) {
    const badge = document.createElement("div");
    badge.style.position = "absolute";
    badge.style.top = "-5px";
    badge.style.right = "-5px";
    badge.style.background = "red";
    badge.style.color = "white";
    badge.style.fontSize = "10px";
    badge.style.fontWeight = "bold";
    badge.style.borderRadius = "10px";
    badge.style.padding = "2px 5px";
    badge.style.boxShadow = "0 1px 3px rgba(0,0,0,0.3)";
    badge.textContent = `+${count}`;
    wrapper.appendChild(badge);
  }

  return wrapper;
}

// Renders every game-group pin via the official @googlemaps/markerclusterer
// library (already used the same way in MapComponent.tsx) so overlapping/
// nearby pins collapse into a single cluster icon at lower zoom levels,
// instead of only de-duplicating pins that share the exact same coordinate
// (the pre-existing `groupedGames` grouping above, which this still layers
// on top of -- a cluster can itself contain several already-grouped pins).
// Also owns the hover-sync: the currently `hoveredGameId` (set by the
// results list) gets its pin visually lifted/highlighted here, and hovering
// a pin reports back up via onHoverGame so the matching list card highlights.
function ClusteredGameMarkers({
  groups,
  onGameSelect,
  hoveredGameId,
  onHoverGame,
}: {
  groups: GameGroup[];
  onGameSelect?: (gameId: string) => void;
  hoveredGameId?: string | null;
  onHoverGame?: (gameId: string | null) => void;
}) {
  const map = useMap();
  const markerLib = useMapsLibrary("marker");
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const contentByKeyRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const [selectedGroup, setSelectedGroup] = useState<GameGroup | null>(null);

  // The clusterer instance itself is created once per `map` (not per `groups` change) --
  // re-instantiating MarkerClusterer's internal grid/algorithm state on every real-time
  // join/leave event (which produces a new `groups` array even when only one game's
  // participant count changed) is unnecessary overhead on top of the marker rebuild below.
  useEffect(() => {
    if (!map) return;
    try {
      const clusterer = new MarkerClusterer({ map });
      clustererRef.current = clusterer;
      return () => {
        clusterer.clearMarkers();
        clusterer.setMap(null);
        clustererRef.current = null;
      };
    } catch (e) {
      console.error("[SearchMap] MarkerClusterer init failed:", e);
      return undefined;
    }
  }, [map]);

  // NOTE: this still rebuilds every marker on any `groups` change (e.g. one game's
  // currentPlayers count updating via socket still recreates all markers, not just that
  // group's), same as this codebase's other clusterer usage in MapComponent.tsx. A fully
  // incremental per-key add/update/remove reconciliation would close that gap, but touches
  // live Google Maps marker/listener lifecycle code that isn't practical to verify without a
  // real Maps API key and browser -- deliberately not attempted blind here. What's fixed is
  // the more expensive clusterer-object recreation on every change (above).
  useEffect(() => {
    const clusterer = clustererRef.current;
    const AdvancedMarkerElement = markerLib?.AdvancedMarkerElement;
    if (!map || !clusterer || typeof AdvancedMarkerElement !== "function") return;

    try {
      const markers = groups.map((group) => {
        const content = buildGroupMarkerContent(group);
        contentByKeyRef.current.set(group.key, content);

        const marker = new AdvancedMarkerElement({
          position: { lat: group.lat, lng: group.lng },
          content,
        });

        // AdvancedMarkerElement dispatches "gmp-click", not the classic Marker's "click" --
        // using "click" here still works but logs a deprecation warning in the console.
        marker.addListener("gmp-click", () => setSelectedGroup(group));
        content.addEventListener("mouseenter", () => onHoverGame?.(group.games[0].id));
        content.addEventListener("mouseleave", () => onHoverGame?.(null));

        return marker;
      });

      clusterer.clearMarkers();
      clusterer.addMarkers(markers);

      return () => {
        clusterer.clearMarkers();
        contentByKeyRef.current.clear();
      };
    } catch (e) {
      console.error("[SearchMap] Failed to create clustered markers:", e);
      return undefined;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, markerLib, groups]);

  // Keep the open InfoWindow's data in sync with the current result set: if its group is
  // still present (same location key), refresh it with the latest games/counts; if the
  // group no longer exists at all (filtered out, moved away), close the InfoWindow instead
  // of leaving it showing a stale/removed group.
  useEffect(() => {
    setSelectedGroup((prev) => {
      if (!prev) return prev;
      return groups.find((g) => g.key === prev.key) ?? null;
    });
  }, [groups]);

  // Highlight whichever pin's group contains the list-hovered game, without
  // rebuilding the clusterer (that would fight with the library's own
  // clustering animation on every list-hover).
  useEffect(() => {
    for (const group of groups) {
      const content = contentByKeyRef.current.get(group.key);
      if (!content) continue;
      const isHovered = !!hoveredGameId && group.games.some((g) => g.id === hoveredGameId);
      content.style.transform = isHovered ? "scale(1.28)" : "scale(1)";
      content.style.filter = isHovered ? "drop-shadow(0 0 0 3px rgba(37,99,235,0.55))" : "none";
      content.style.zIndex = isHovered ? "3" : "0";
    }
  }, [hoveredGameId, groups]);

  if (!selectedGroup) return null;

  return (
    <InfoWindow
      position={{ lat: selectedGroup.lat, lng: selectedGroup.lng }}
      onCloseClick={() => setSelectedGroup(null)}
      headerDisabled
      minWidth={252}
      maxWidth={300}
      pixelOffset={[0, -10]}
    >
      <Box sx={{ p: 1.5 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 1.25 }}>
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0 }}>
            <PlaceRoundedIcon sx={{ fontSize: 18, color: "primary.main", flexShrink: 0 }} />
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 800, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {selectedGroup.games[0].field?.name || selectedGroup.games[0].fieldName || "מיקום המשחק"}
            </Typography>
          </Stack>
          <IconButton size="small" onClick={() => setSelectedGroup(null)} aria-label="סגירה" sx={{ flexShrink: 0, m: -0.5 }}>
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        </Stack>
        <Stack spacing={0.75}>
          {selectedGroup.games.map((g) => {
            const visual = getSportVisual(g.sport);
            const isFull = g.currentPlayers >= g.maxPlayers;
            const isHovered = g.id === hoveredGameId;
            return (
              <Box
                key={g.id}
                onClick={() => onGameSelect?.(g.id)}
                onMouseEnter={() => onHoverGame?.(g.id)}
                onMouseLeave={() => onHoverGame?.(null)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  p: 1,
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: isHovered ? "primary.main" : "divider",
                  borderInlineStartWidth: 3,
                  borderInlineStartColor: visual.color,
                  cursor: "pointer",
                  bgcolor: isHovered ? "action.hover" : "transparent",
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
  );
}

function EmptyFieldMarker({ field }: { field: any }) {
  const [open, setOpen] = useState(false);
  const markerLib = useMapsLibrary("marker");
  if (!markerLib) return null;
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
          <Box sx={{ p: 1.5, textAlign: "center", position: "relative" }}>
            <IconButton
              size="small"
              onClick={() => setOpen(false)}
              aria-label="סגירה"
              sx={{ position: "absolute", top: 0, insetInlineEnd: 0 }}
            >
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
            <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.5} sx={{ mb: 0.5, px: 3 }}>
              <PlaceRoundedIcon sx={{ fontSize: 18, color: "text.secondary", flexShrink: 0 }} />
              <Typography
                variant="subtitle2"
                sx={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
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
