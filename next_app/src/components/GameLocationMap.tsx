"use client";
import { useMemo, useState } from "react";
import { APIProvider, Map, AdvancedMarker, Pin, InfoWindow } from "@vis.gl/react-google-maps";

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

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
  const center = useMemo(() => ({ lat, lng }), [lat, lng]);
  const [infoOpen, setInfoOpen] = useState(false);

  if (!GOOGLE_MAPS_API_KEY) {
    return <div style={{ color: "#64748b", fontSize: 14 }}>מפה לא זמינה כרגע.</div>;
  }

  return (
    <div style={{ width: "100%", height }}>
      <APIProvider apiKey={GOOGLE_MAPS_API_KEY} language="he">
        <Map
          mapId="DEMO_MAP_ID"
          defaultCenter={center}
          defaultZoom={16}
          gestureHandling="greedy"
          disableDefaultUI={false}
          style={{ width: "100%", height: "100%" }}
        >
          <AdvancedMarker position={center} onClick={() => setInfoOpen(true)}>
            <Pin background="#059669" borderColor="#047857" glyphColor="#fff" />
          </AdvancedMarker>
          {infoOpen && (
            <InfoWindow position={center} onCloseClick={() => setInfoOpen(false)}>
              {title || "מיקום המשחק"}
            </InfoWindow>
          )}
        </Map>
      </APIProvider>
    </div>
  );
}
