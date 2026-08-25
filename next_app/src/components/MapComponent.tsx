"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { APIProvider, Map as GoogleMap, AdvancedMarker, Pin, InfoWindow, useMap } from "@vis.gl/react-google-maps";
import { MarkerClusterer } from "@googlemaps/markerclusterer";

type FieldPoint = {
  id: string;
  name: string;
  location?: string | null;
  lat?: number | null;
  lng?: number | null;
};

type FieldWithCoords = Omit<FieldPoint, "lat" | "lng"> & { lat: number; lng: number };

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";
const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

type MapComponentProps = {
  onSelect?: (field: { id: string; name: string; location?: string | null }) => void;
  pickMode?: boolean;
  picked?: { lat: number; lng: number } | null;
  onPick?: (pt: { lat: number; lng: number }) => void;
};

export default function MapComponent({ onSelect, pickMode, picked, onPick }: MapComponentProps) {
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [fields, setFields] = useState<FieldPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    async function run() {
      try {
        const res = await fetch(`${API_BASE}/api/fields`, { cache: "no-store" });
        const arr = (await res.json()) as Array<{ id: string; name: string; location?: string | null; lat?: number; lng?: number }>;
        if (!ignore) {
          setFields(
            arr.map((f) => ({
              id: f.id,
              name: f.name,
              location: f.location,
              lat: typeof f.lat === "number" ? f.lat : undefined,
              lng: typeof f.lng === "number" ? f.lng : undefined,
            }))
          );
        }
      } catch {
        if (!ignore) setFields([]);
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    run();
    return () => {
      ignore = true;
    };
  }, []);

  // Get user geolocation (fallback Tel Aviv)
  useEffect(() => {
    if (!navigator.geolocation) {
      setUserLocation({ lat: 32.0853, lng: 34.7818 });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setUserLocation({ lat: 32.0853, lng: 34.7818 })
    );
  }, []);

  const fieldMarkers: FieldWithCoords[] = useMemo(() => {
    return fields
      .filter((f) => typeof f.lat === "number" && typeof f.lng === "number")
      .map((f) => ({
        id: f.id,
        name: f.name,
        location: f.location ?? null,
        lat: Number(f.lat),
        lng: Number(f.lng),
      }));
  }, [fields]);

  if (!GOOGLE_MAPS_API_KEY) {
    return <div style={{ color: "#64748b", fontSize: 14 }}>מפה לא זמינה כרגע.</div>;
  }

  if (!userLocation) return <div style={{ color: "#64748b", fontSize: 14 }}>טוען מפה…</div>;

  return (
    <div style={{ width: "100%", height: 450 }}>
      <APIProvider apiKey={GOOGLE_MAPS_API_KEY} language="he">
        <GoogleMap
          mapId="DEMO_MAP_ID"
          defaultCenter={userLocation}
          defaultZoom={13}
          gestureHandling="greedy"
          disableDefaultUI={false}
          style={{ width: "100%", height: "100%" }}
        >
          <AdvancedMarker position={userLocation}>
            <Pin background="#2563eb" borderColor="#1d4ed8" glyphColor="#fff" />
          </AdvancedMarker>
          <ClusteredFieldMarkers points={fieldMarkers} onSelect={onSelect} />
          {pickMode ? <PickLocationLayer picked={picked} onPick={onPick} /> : null}
        </GoogleMap>
      </APIProvider>
      {loading ? <div style={{ color: "#64748b", fontSize: 13, marginTop: 8 }}>טוען מגרשים…</div> : null}
      {!loading && fieldMarkers.length === 0 ? (
        <div style={{ color: "#64748b", fontSize: 13, marginTop: 8 }}>אין מגרשים עם מיקום להצגה.</div>
      ) : null}
    </div>
  );
}

function PickLocationLayer({
  picked,
  onPick,
}: {
  picked: { lat: number; lng: number } | null | undefined;
  onPick?: (pt: { lat: number; lng: number }) => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    const listener = map.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (e.latLng) onPick?.({ lat: e.latLng.lat(), lng: e.latLng.lng() });
    });
    return () => listener?.remove();
  }, [map, onPick]);

  return picked ? (
    <AdvancedMarker position={picked}>
      <Pin background="#059669" borderColor="#047857" glyphColor="#fff" />
    </AdvancedMarker>
  ) : null;
}

// Clusters field markers using the official @googlemaps/markerclusterer library, which manages
// its own plain google.maps.Marker instances imperatively (clustering needs direct access to the
// underlying Marker objects, so this isn't expressed as declarative AdvancedMarker JSX like the
// rest of the map).
function ClusteredFieldMarkers({
  points,
  onSelect,
}: {
  points: FieldWithCoords[];
  onSelect?: (field: { id: string; name: string; location?: string | null }) => void;
}) {
  const map = useMap();
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const [selected, setSelected] = useState<FieldWithCoords | null>(null);
  const [infoPos, setInfoPos] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!map) return;

    const markers = points.map((p) => {
      const marker = new google.maps.Marker({ position: { lat: p.lat, lng: p.lng } });
      marker.addListener("click", () => {
        setSelected(p);
        setInfoPos({ lat: p.lat, lng: p.lng });
      });
      return marker;
    });

    const clusterer = new MarkerClusterer({ map, markers });
    clustererRef.current = clusterer;

    return () => {
      clusterer.clearMarkers();
      clusterer.setMap(null);
      clustererRef.current = null;
    };
  }, [map, points]);

  if (!infoPos || !selected) return null;

  return (
    <InfoWindow
      position={infoPos}
      onCloseClick={() => {
        setSelected(null);
        setInfoPos(null);
      }}
    >
      <div style={{ minWidth: 160 }}>
        <div style={{ fontWeight: 600 }}>{selected.name}</div>
        <div style={{ fontSize: 12, opacity: 0.8 }}>{selected.location || ""}</div>
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            style={{
              background: "#059669",
              color: "#fff",
              border: "none",
              borderRadius: 999,
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
            onClick={() => onSelect?.({ id: selected.id, name: selected.name, location: selected.location })}
          >
            בחר מגרש זה
          </button>
        </div>
      </div>
    </InfoWindow>
  );
}
