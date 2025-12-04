"use client";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { useMemo } from "react";

const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export default function GameLocationMap({
  lat,
  lng,
  title,
  height = 240,
}: {
  lat: number;
  lng: number;
  title?: string;
  height?: number;
}) {
  const center = useMemo<[number, number]>(() => [lat, lng], [lat, lng]);
  return (
    <div style={{ width: "100%", height }}>
      <MapContainer center={center} zoom={16} style={{ width: "100%", height: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={center} icon={defaultIcon}>
          <Popup>{title || "Game location"}</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}


