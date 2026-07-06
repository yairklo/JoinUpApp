"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { Game } from "@/types/game";
import Link from "next/link";

// Setup standard Leaflet icons
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const emptyIcon = L.divIcon({
  html: `
    <div style="position:relative; width:36px; height:36px;">
      <div style="
        background-color: #94a3b8; 
        width: 100%; 
        height: 100%; 
        border-radius: 50%; 
        border: 3px solid white; 
        box-shadow: 0 4px 6px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"></path>
          <circle cx="12" cy="10" r="3"></circle>
        </svg>
      </div>
    </div>
  `,
  className: "",
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -18]
});

interface SearchMapComponentProps {
  games: Game[];
  emptyFields?: any[];
  onBoundsChanged?: (bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }) => void;
  onGameSelect?: (gameId: string) => void;
  targetLocation?: [number, number] | null;
}

const getSportColorHex = (sport?: string) => {
  const s = sport?.toLowerCase() || '';
  if (s.includes('כדורגל') || s.includes('soccer') || s.includes('football')) return '#16a34a'; // green-600
  if (s.includes('כדורסל') || s.includes('basketball')) return '#f97316'; // orange-500
  if (s.includes('טניס') || s.includes('tennis')) return '#eab308'; // yellow-500
  if (s.includes('כדורעף') || s.includes('volleyball')) return '#60a5fa'; // blue-400
  if (s.includes('פדל') || s.includes('padel')) return '#a855f7'; // purple-500
  return '#2563eb'; // blue-600 (default)
};

export default function SearchMapComponent({ games, emptyFields = [], onBoundsChanged, onGameSelect, targetLocation }: SearchMapComponentProps) {
  const [userLocation, setUserLocation] = useState<[number, number]>([32.0853, 34.7818]); // Default Tel Aviv

  // Attempt to get user geolocation on mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation([pos.coords.latitude, pos.coords.longitude]),
        () => {} // Silent fallback to default
      );
    }
  }, []);

  // Group games that have identical coordinates so they don't visually overlap perfectly
  const groupedGames = useMemo(() => {
    return Object.values(
      games.reduce((acc, game) => {
        const lat = game.customLat ?? game.fieldLat ?? game.field?.lat;
        const lng = game.customLng ?? game.fieldLng ?? game.field?.lng;
        if (typeof lat !== "number" || typeof lng !== "number") return acc;
        const key = `${lat},${lng}`;
        if (!acc[key]) acc[key] = [];
        acc[key].push(game);
        return acc;
      }, {} as Record<string, Game[]>)
    );
  }, [games]);

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <MapContainer center={userLocation} zoom={12} style={{ width: "100%", height: "100%" }}>
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapEventsListener onBoundsChanged={onBoundsChanged} targetLocation={targetLocation} />
        
        {groupedGames.map((group, idx) => {
          const firstGame = group[0];
          const lat = firstGame.customLat ?? firstGame.fieldLat ?? firstGame.field?.lat;
          const lng = firstGame.customLng ?? firstGame.fieldLng ?? firstGame.field?.lng;
          
          if (typeof lat !== "number" || typeof lng !== "number") return null;

          const uniqueSports = Array.from(new Set(group.map(g => g.sport)));
          const isMixed = uniqueSports.length > 1;
          const bgColor = isMixed ? '#64748b' : getSportColorHex(firstGame.sport);
          const badgeHtml = group.length > 1 
            ? `<div style="position:absolute; top:-5px; right:-5px; background:red; color:white; font-size:10px; font-weight:bold; border-radius:10px; padding:2px 5px; box-shadow:0 1px 3px rgba(0,0,0,0.3);">+${group.length}</div>`
            : '';

          // Create custom Leaflet divIcon replicating mobile rounded border with shadow
          const customIcon = L.divIcon({
            html: `
              <div style="position:relative; width:36px; height:36px;">
                <div style="
                  background-color: ${bgColor}; 
                  width: 100%; 
                  height: 100%; 
                  border-radius: 50%; 
                  border: 3px solid white; 
                  box-shadow: 0 4px 6px rgba(0,0,0,0.3);
                  display: flex;
                  align-items: center;
                  justify-content: center;
                ">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                  </svg>
                </div>
                ${badgeHtml}
              </div>
            `,
            className: "",
            iconSize: [36, 36],
            iconAnchor: [18, 18],
            popupAnchor: [0, -18]
          });

          return (
            <Marker key={idx} position={[lat, lng]} icon={customIcon}>
              <Popup>
                <div style={{ minWidth: 200 }}>
                  <h6 style={{ fontWeight: 700, marginBottom: "8px" }}>
                    {firstGame.field?.name || firstGame.fieldName || "Game Location"}
                  </h6>
                  {group.map(g => (
                    <div
                      key={g.id}
                      style={{
                        padding: "8px",
                        marginBottom: "4px",
                        border: "1px solid #e0e0e0",
                        borderRadius: "8px",
                        cursor: "pointer"
                      }}
                      onClick={() => onGameSelect?.(g.id)}
                    >
                      <div style={{ fontSize: "14px", fontWeight: 600 }}>{g.sport}</div>
                      <div style={{ fontSize: "12px", color: "#666" }}>
                        {g.date} at {g.time}
                      </div>
                      <div style={{ fontSize: "12px", color: "#2e7d32", fontWeight: 500 }}>
                        Players: {g.currentPlayers}/{g.maxPlayers}
                      </div>
                    </div>
                  ))}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {emptyFields.map((field, idx) => {
          if (typeof field.lat !== "number" || typeof field.lng !== "number") return null;

          return (
            <Marker key={`empty-${idx}`} position={[field.lat, field.lng]} icon={emptyIcon}>
              <Popup>
                <div style={{ minWidth: 200, textAlign: "center" }}>
                  <h6 style={{ fontWeight: 700, marginBottom: "8px" }}>
                    {field.name}
                  </h6>
                  <div style={{ fontSize: "12px", color: "#666", marginBottom: "12px" }}>
                    {field.location || "No location info"}
                  </div>
                  <Link href={`/games/new?fieldId=${field.id}`} passHref legacyBehavior>
                    <a
                      style={{
                        display: "block",
                        backgroundColor: "#2563eb",
                        color: "white",
                        padding: "8px 12px",
                        borderRadius: "8px",
                        fontSize: "14px",
                        fontWeight: 600,
                        textDecoration: "none",
                        cursor: "pointer"
                      }}
                    >
                      פתח משחק במגרש זה
                    </a>
                  </Link>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}

// Child component to handle map events and debounce boundary changes
function MapEventsListener({
  onBoundsChanged,
  targetLocation
}: {
  onBoundsChanged?: (bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }) => void;
  targetLocation?: [number, number] | null;
}) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const map = useMapEvents({
    moveend: (e) => {
      const b = e.target.getBounds();
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      // Debounce 500ms
      timeoutRef.current = setTimeout(() => {
        onBoundsChanged?.({
          minLat: b.getSouth(),
          maxLat: b.getNorth(),
          minLng: b.getWest(),
          maxLng: b.getEast(),
        });
      }, 500);
    },
    zoomend: (e) => {
      const b = e.target.getBounds();
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      timeoutRef.current = setTimeout(() => {
        onBoundsChanged?.({
          minLat: b.getSouth(),
          maxLat: b.getNorth(),
          minLng: b.getWest(),
          maxLng: b.getEast(),
        });
      }, 500);
    }
  });

  // Watch for targetLocation changes to pan the map
  useEffect(() => {
    if (targetLocation && map) {
      map.flyTo(targetLocation, 12, { duration: 1.5 });
    }
  }, [targetLocation, map]);

  return null;
}
