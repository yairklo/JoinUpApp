"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { Game } from "@/types/game";

// Setup standard Leaflet icons
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface SearchMapComponentProps {
  games: Game[];
  onBoundsChanged?: (bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }) => void;
  onGameSelect?: (gameId: string) => void;
}

export default function SearchMapComponent({ games, onBoundsChanged, onGameSelect }: SearchMapComponentProps) {
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
        <MapEventsListener onBoundsChanged={onBoundsChanged} />
        
        {groupedGames.map((group, idx) => {
          const firstGame = group[0];
          const lat = firstGame.customLat ?? firstGame.fieldLat ?? firstGame.field?.lat;
          const lng = firstGame.customLng ?? firstGame.fieldLng ?? firstGame.field?.lng;
          
          if (typeof lat !== "number" || typeof lng !== "number") return null;

          return (
            <Marker key={idx} position={[lat, lng]} icon={defaultIcon}>
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
      </MapContainer>
    </div>
  );
}

// Child component to handle map events and debounce boundary changes
function MapEventsListener({
  onBoundsChanged
}: {
  onBoundsChanged?: (bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }) => void;
}) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useMapEvents({
    moveend: (e) => {
      const map = e.target;
      const bounds = map.getBounds();
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      // Debounce 500ms
      timeoutRef.current = setTimeout(() => {
        onBoundsChanged?.({
          minLat: bounds.getSouth(),
          maxLat: bounds.getNorth(),
          minLng: bounds.getWest(),
          maxLng: bounds.getEast(),
        });
      }, 500);
    },
    zoomend: (e) => {
      const map = e.target;
      const bounds = map.getBounds();
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      timeoutRef.current = setTimeout(() => {
        onBoundsChanged?.({
          minLat: bounds.getSouth(),
          maxLat: bounds.getNorth(),
          minLng: bounds.getWest(),
          maxLng: bounds.getEast(),
        });
      }, 500);
    }
  });

  return null;
}
